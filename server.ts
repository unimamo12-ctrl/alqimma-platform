import { createServer } from 'http';
import { Server, type Socket } from 'socket.io';
import next from 'next';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || 'localhost';
const port = parseInt(process.env.PORT || '3000', 10);

const prisma = new PrismaClient();

type Role = 'STUDENT' | 'TEACHER' | 'ADMIN';

interface AuthUser {
  userId: string;
  email: string;
  role: Role;
  studentId: string | null;
  teacherId: string | null;
}

interface Participant {
  socketId: string;
  userId: string;
  studentId: string | null;
  name: string;
  role: Role;
  isMuted: boolean;
  isCameraOff: boolean;
  isHandRaised: boolean;
  isSharingScreen: boolean;
  joinedAt: Date;
}

interface Room {
  sessionId: string;
  hostTeacherId: string;
  participants: Map<string, Participant>;
  chatMessages: Array<{ userId: string; name: string; content: string; createdAt: Date }>;
  isRecording: boolean;
  startedAt: Date | null;
}

const liveRooms = new Map<string, Room>();

async function openAttendance(sessionId: string, studentId: string) {
  try {
    await prisma.attendance.upsert({
      where: { sessionId_studentId: { sessionId, studentId } },
      create: { sessionId, studentId, joinTime: new Date() },
      update: {},
    });
  } catch (error) {
    console.error('attendance join sync failed', error);
  }
}

async function closeAttendance(sessionId: string, studentId: string) {
  try {
    const existing = await prisma.attendance.findUnique({
      where: { sessionId_studentId: { sessionId, studentId } },
    });

    if (!existing || existing.leaveTime) return;

    const leaveTime = new Date();
    const duration = Math.max(
      0,
      Math.floor((leaveTime.getTime() - existing.joinTime.getTime()) / 60000),
    );

    await prisma.attendance.update({
      where: { id: existing.id },
      data: { leaveTime, duration },
    });
  } catch (error) {
    console.error('attendance leave sync failed', error);
  }
}

function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};
  return header.split(';').reduce<Record<string, string>>((acc, part) => {
    const index = part.indexOf('=');
    if (index === -1) return acc;
    const key = part.slice(0, index).trim();
    const value = decodeURIComponent(part.slice(index + 1).trim());
    if (key) acc[key] = value;
    return acc;
  }, {});
}

function authenticate(socket: Socket): AuthUser | null {
  try {
    const cookies = parseCookies(socket.handshake.headers.cookie);
    const token = cookies.access_token;
    if (!token) return null;

    const secret = process.env.JWT_SECRET;
    if (!secret) return null;

    const payload = jwt.verify(token, secret) as {
      userId: string;
      email: string;
      role: Role;
    };

    return {
      userId: payload.userId,
      email: payload.email,
      role: payload.role,
      studentId: null,
      teacherId: null,
    };
  } catch {
    return null;
  }
}

async function resolveProfile(user: AuthUser): Promise<AuthUser | null> {
  const dbUser = await prisma.user.findUnique({
    where: { id: user.userId },
    select: {
      id: true,
      email: true,
      role: true,
      status: true,
      student: { select: { id: true } },
      teacher: { select: { id: true } },
    },
  });

  if (!dbUser || dbUser.status !== 'ACTIVE') return null;

  return {
    userId: dbUser.id,
    email: dbUser.email,
    role: dbUser.role,
    studentId: dbUser.student?.id ?? null,
    teacherId: dbUser.teacher?.id ?? null,
  };
}

async function getOrCreateRoom(sessionId: string): Promise<Room | null> {
  const existing = liveRooms.get(sessionId);
  if (existing) return existing;

  const live = await prisma.liveSession.findUnique({
    where: { id: sessionId },
    select: { id: true, teacherId: true, status: true },
  });

  if (!live || live.status === 'CANCELLED') return null;

  const room: Room = {
    sessionId,
    hostTeacherId: live.teacherId,
    participants: new Map(),
    chatMessages: [],
    isRecording: false,
    startedAt: null,
  };

  liveRooms.set(sessionId, room);
  return room;
}

function canManage(room: Room, user: AuthUser): boolean {
  return user.role === 'ADMIN' || room.hostTeacherId === user.teacherId;
}

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer((req, res) => handle(req, res));

  const io = new Server(httpServer, {
    path: '/api/socketio',
    serveClient: false,
  });

  io.use(async (socket, nextFn) => {
    const raw = authenticate(socket);
    if (!raw) {
      nextFn(new Error('UNAUTHORIZED'));
      return;
    }

    const user = await resolveProfile(raw);
    if (!user) {
      nextFn(new Error('UNAUTHORIZED'));
      return;
    }

    socket.data.user = user;
    nextFn();
  });

  io.on('connection', (socket) => {
    const user = socket.data.user as AuthUser;

    async function recordAttendance(sessionId: string, joining: boolean) {
      if (user.role !== 'STUDENT' || !user.studentId) return;
      if (joining) {
        await openAttendance(sessionId, user.studentId);
      } else {
        await closeAttendance(sessionId, user.studentId);
      }
    }

    socket.on('join-session', async ({ sessionId }: { sessionId?: string }, ack?: (r: unknown) => void) => {
      if (!sessionId) return;

      const room = await getOrCreateRoom(sessionId);
      if (!room) {
        socket.emit('session-error', { message: 'الحصة غير موجودة' });
        ack?.({ success: false, message: 'الحصة غير موجودة' });
        return;
      }

      if (user.role === 'STUDENT') {
        const live = await prisma.liveSession.findUnique({
          where: { id: sessionId },
          select: { status: true, scheduledAt: true },
        });
        const opensAt = (live?.scheduledAt.getTime() ?? 0) - 15 * 60 * 1000;
        if (live?.status === 'SCHEDULED' && Date.now() < opensAt) {
          socket.emit('session-error', { message: 'لم تبدأ الحصة بعد' });
          ack?.({ success: false, message: 'لم تبدأ الحصة بعد' });
          return;
        }
      }

      const name = await resolveDisplayName(user);

      const existing = room.participants.get(user.userId);
      if (existing && existing.socketId !== socket.id) {
        io.to(existing.socketId).emit('force-disconnect', {
          message: 'تم تسجيل الدخول إلى حسابك من جهاز آخر',
        });
      }

      socket.join(sessionId);

      const participant: Participant = {
        socketId: socket.id,
        userId: user.userId,
        studentId: user.studentId,
        name,
        role: user.role,
        isMuted: false,
        isCameraOff: false,
        isHandRaised: false,
        isSharingScreen: false,
        joinedAt: new Date(),
      };

      room.participants.set(user.userId, participant);
      socket.data.sessionId = sessionId;

      socket.to(sessionId).emit('participant-joined', { participant });
      await recordAttendance(sessionId, true);

      ack?.({ success: true });
      socket.emit('session-joined', {
        sessionId,
        participants: Array.from(room.participants.values()),
        chatMessages: room.chatMessages,
        isRecording: room.isRecording,
      });
    });

    socket.on('start-session', async ({ sessionId }: { sessionId?: string }) => {
      const room = liveRooms.get(sessionId ?? '');
      if (!room || !canManage(room, user)) return;

      room.startedAt = new Date();
      await prisma.liveSession.update({
        where: { id: room.sessionId },
        data: { status: 'LIVE' },
      });

      io.to(room.sessionId).emit('session-started', { startedAt: room.startedAt });
    });

    // signaling is addressed by userId, and the receiver always needs the
    // SENDER's identity (name/role) to label the peer it is negotiating with
    const relaySignaling = (
      room: Room,
      event: 'offer' | 'answer' | 'ice-candidate',
      targetUserId: unknown,
      payload: Record<string, unknown>,
    ) => {
      const target = room.participants.get(targetUserId as string);
      if (!target) return false;

      const sender = room.participants.get(user.userId);
      io.to(target.socketId).emit(event, {
        ...payload,
        fromUserId: user.userId,
        fromName: sender?.name ?? null,
        fromRole: sender?.role ?? user.role,
      });
      return true;
    };

    socket.on('offer', ({ sessionId, targetUserId, sdp }: Record<string, unknown>) => {
      const room = liveRooms.get(sessionId as string);
      if (!room) return;
      relaySignaling(room, 'offer', targetUserId, { sdp });
    });

    socket.on('answer', ({ sessionId, targetUserId, sdp }: Record<string, unknown>) => {
      const room = liveRooms.get(sessionId as string);
      if (!room) return;
      relaySignaling(room, 'answer', targetUserId, { sdp });
    });

    socket.on('ice-candidate', ({ sessionId, targetUserId, candidate }: Record<string, unknown>) => {
      const room = liveRooms.get(sessionId as string);
      if (!room) return;
      relaySignaling(room, 'ice-candidate', targetUserId, { candidate });
    });

    socket.on(
      'toggle-mic',
      ({ sessionId, isMuted }: { sessionId?: string; isMuted?: boolean }) => {
        const room = liveRooms.get(sessionId ?? '');
        const participant = room?.participants.get(user.userId);
        if (!room || !participant) return;
        participant.isMuted = isMuted === true;
        socket.to(room.sessionId).emit('participant-updated', {
          userId: user.userId,
          isMuted: participant.isMuted,
        });
      },
    );

    socket.on(
      'toggle-camera',
      ({ sessionId, isCameraOff }: { sessionId?: string; isCameraOff?: boolean }) => {
        const room = liveRooms.get(sessionId ?? '');
        const participant = room?.participants.get(user.userId);
        if (!room || !participant) return;
        participant.isCameraOff = isCameraOff === true;
        socket.to(room.sessionId).emit('participant-updated', {
          userId: user.userId,
          isCameraOff: participant.isCameraOff,
        });
      },
    );

    socket.on(
      'raise-hand',
      ({ sessionId, isHandRaised }: { sessionId?: string; isHandRaised?: boolean }) => {
        const room = liveRooms.get(sessionId ?? '');
        const participant = room?.participants.get(user.userId);
        if (!room || !participant) return;
        participant.isHandRaised = isHandRaised === true;
        socket.to(room.sessionId).emit('participant-updated', {
          userId: user.userId,
          isHandRaised: participant.isHandRaised,
        });
      },
    );

    socket.on('chat-message', async ({ sessionId, content }: { sessionId?: string; content?: string }) => {
      const room = liveRooms.get(sessionId ?? '');
      if (!room) return;

      const text = (content ?? '').toString().trim();
      if (!text) return;
      if (text.length > 1000) return;

      const name = await resolveDisplayName(user);
      const message = { userId: user.userId, name, content: text, createdAt: new Date() };
      room.chatMessages.push(message);
      if (room.chatMessages.length > 200) room.chatMessages.shift();

      io.to(room.sessionId).emit('chat-message', message);
    });

    socket.on('clear-chat', ({ sessionId }: { sessionId?: string }) => {
      const room = liveRooms.get(sessionId ?? '');
      if (!room || !canManage(room, user)) return;
      room.chatMessages = [];
      io.to(room.sessionId).emit('chat-cleared');
    });

    socket.on(
      'screen-share',
      ({ sessionId, isSharing }: { sessionId?: string; isSharing?: boolean }) => {
        const room = liveRooms.get(sessionId ?? '');
        const participant = room?.participants.get(user.userId);
        if (!room || !participant) return;
        participant.isSharingScreen = isSharing === true;
        socket.to(room.sessionId).emit('participant-updated', {
          userId: user.userId,
          isSharingScreen: participant.isSharingScreen,
        });
      },
    );

    socket.on(
      'show-snapshot',
      async ({ sessionId, url, name }: { sessionId?: string; url?: string; name?: string }) => {
        const room = liveRooms.get(sessionId ?? '');
        if (!room || !canManage(room, user)) return;
        if (typeof url !== 'string' || !url.startsWith('/uploads/image/')) return;

        const name2 = await resolveDisplayName(user);
        io.to(room.sessionId).emit('snapshot-shown', {
          url,
          name: typeof name === 'string' && name ? name.slice(0, 80) : `لقطة من ${name2}`,
          at: Date.now(),
        });
      },
    );

    socket.on('clear-snapshot', ({ sessionId }: { sessionId?: string }) => {
      const room = liveRooms.get(sessionId ?? '');
      if (!room || !canManage(room, user)) return;
      io.to(room.sessionId).emit('snapshot-cleared');
    });

    socket.on('mute-participant', ({ sessionId, targetUserId }: Record<string, string>) => {
      const room = liveRooms.get(sessionId);
      if (!room || !canManage(room, user)) return;
      const target = room.participants.get(targetUserId);
      if (!target) return;
      target.isMuted = true;
      io.to(target.socketId).emit('force-mute');
      socket.to(room.sessionId).emit('participant-updated', {
        userId: targetUserId,
        isMuted: true,
      });
    });

    socket.on('remove-participant', ({ sessionId, targetUserId }: Record<string, string>) => {
      const room = liveRooms.get(sessionId);
      if (!room || !canManage(room, user)) return;
      const target = room.participants.get(targetUserId);
      if (!target) return;
      io.to(target.socketId).emit('force-disconnect', {
        message: 'تمت إزالتك من الحصة من قبل الأستاذ',
      });
      room.participants.delete(targetUserId);
      socket.to(room.sessionId).emit('participant-left', { userId: targetUserId });
    });

    socket.on('start-recording', ({ sessionId }: { sessionId?: string }) => {
      const room = liveRooms.get(sessionId ?? '');
      if (!room || !canManage(room, user)) return;
      room.isRecording = true;
      io.to(room.sessionId).emit('recording-started');
    });

    socket.on('stop-recording', async ({ sessionId }: { sessionId?: string }) => {
      const room = liveRooms.get(sessionId ?? '');
      if (!room || !canManage(room, user)) return;
      room.isRecording = false;
      io.to(room.sessionId).emit('recording-stopped');
      await prisma.liveSession.update({
        where: { id: room.sessionId },
        data: { isRecorded: true },
      });
    });

    socket.on('leave-session', async ({ sessionId }: { sessionId?: string }) => {
      const room = liveRooms.get(sessionId ?? '');
      if (!room) return;
      room.participants.delete(user.userId);
      socket.leave(room.sessionId);
      socket.to(room.sessionId).emit('participant-left', { userId: user.userId });
      await recordAttendance(room.sessionId, false);
    });

    socket.on('end-session', async ({ sessionId }: { sessionId?: string }) => {
      const room = liveRooms.get(sessionId ?? '');
      if (!room || !canManage(room, user)) return;

      io.to(room.sessionId).emit('session-ended', { message: 'انتهت الحصة' });

      await prisma.liveSession.update({
        where: { id: room.sessionId },
        data: { status: 'ENDED', endedAt: new Date() },
      });

      for (const participant of room.participants.values()) {
        if (!participant.studentId) continue;
        await closeAttendance(room.sessionId, participant.studentId);
      }

      liveRooms.delete(room.sessionId);
    });

    socket.on('disconnect', async () => {
      const sessionId = socket.data.sessionId as string | undefined;
      if (!sessionId) return;
      const room = liveRooms.get(sessionId);
      if (!room) return;

      const participant = room.participants.get(user.userId);
      if (participant && participant.socketId === socket.id) {
        room.participants.delete(user.userId);
        socket.to(sessionId).emit('participant-left', { userId: user.userId });
        await recordAttendance(sessionId, false);
      }
    });
  });

  async function resolveDisplayName(user: AuthUser): Promise<string> {
    const record = await prisma.user.findUnique({
      where: { id: user.userId },
      select: {
        student: { select: { firstName: true, lastName: true } },
        teacher: { select: { firstName: true, lastName: true } },
      },
    });

    const profile = record?.student ?? record?.teacher;
    return profile ? `${profile.firstName} ${profile.lastName}` : user.email;
  }

  httpServer.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
    console.log('> Socket.IO ready on /api/socketio');
  });
});
