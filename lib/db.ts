import { kv } from '@vercel/kv';
import fs from 'fs';
import path from 'path';

export interface User {
  id: string;
  name: string;
  pin: string;
  color: string;
  avatar: string;
}

export interface Task {
  id: string;
  userId: string;
  text: string;
  status: 'todo' | 'working' | 'done';
  order: number;
  updatedAt: string;
}

// Check if Vercel KV environment variables are present
const useLocalDB = !process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN;

// Local JSON File Database Configuration
const LOCAL_DB_DIR = path.join(process.cwd(), '.data');
const LOCAL_DB_FILE = path.join(LOCAL_DB_DIR, 'db.json');

interface LocalDBSchema {
  users: Record<string, User>; // userId -> User
  boards: Record<string, Record<string, Task>>; // dateStr -> taskId -> Task
}

function initLocalDB(): LocalDBSchema {
  if (!fs.existsSync(LOCAL_DB_DIR)) {
    fs.mkdirSync(LOCAL_DB_DIR, { recursive: true });
  }
  if (!fs.existsSync(LOCAL_DB_FILE)) {
    const initialData: LocalDBSchema = { users: {}, boards: {} };
    fs.writeFileSync(LOCAL_DB_FILE, JSON.stringify(initialData, null, 2), 'utf-8');
    return initialData;
  }
  try {
    const content = fs.readFileSync(LOCAL_DB_FILE, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.error('Error reading local database, resetting', error);
    const initialData: LocalDBSchema = { users: {}, boards: {} };
    fs.writeFileSync(LOCAL_DB_FILE, JSON.stringify(initialData, null, 2), 'utf-8');
    return initialData;
  }
}

function writeLocalDB(data: LocalDBSchema) {
  if (!fs.existsSync(LOCAL_DB_DIR)) {
    fs.mkdirSync(LOCAL_DB_DIR, { recursive: true });
  }
  fs.writeFileSync(LOCAL_DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

// General Helper: Standardize date checking timezone
// Calculates date in the configured timezone (default Africa/Algiers, UTC+1)
// The day resets at 4:00 AM in the configured timezone, so any time before 4:00 AM
// is treated as part of the previous operational day.
export function getLocalDateString(timezone = 'Africa/Algiers'): string {
  try {
    const d = new Date();
    // Shift the date back by 4 hours to align the date boundary with 4:00 AM
    d.setHours(d.getHours() - 4);

    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return formatter.format(d);
  } catch {
    // Fallback if timezone is invalid
    const d = new Date();
    d.setHours(d.getHours() - 4);
    return d.toISOString().split('T')[0];
  }
}

// User Database Operations
export async function getAllUsers(): Promise<User[]> {
  if (useLocalDB) {
    const db = initLocalDB();
    return Object.values(db.users);
  } else {
    try {
      const usersMap = await kv.hgetall<Record<string, User>>('users');
      return usersMap ? Object.values(usersMap) : [];
    } catch (e) {
      console.error('KV Error in getAllUsers, falling back to empty', e);
      return [];
    }
  }
}

export async function getUserById(id: string): Promise<User | null> {
  if (useLocalDB) {
    const db = initLocalDB();
    return db.users[id] || null;
  } else {
    try {
      return await kv.hget<User>('users', id);
    } catch (e) {
      console.error(`KV Error in getUserById for ${id}`, e);
      return null;
    }
  }
}

export async function getUserByName(name: string): Promise<User | null> {
  const users = await getAllUsers();
  const normalized = name.trim().toLowerCase();
  return users.find(u => u.name.trim().toLowerCase() === normalized) || null;
}

export async function createUser(userData: Omit<User, 'id'>): Promise<User> {
  const id = Math.random().toString(36).substring(2, 11);
  const newUser: User = { ...userData, id };

  if (useLocalDB) {
    const db = initLocalDB();
    db.users[id] = newUser;
    writeLocalDB(db);
  } else {
    await kv.hset('users', { [id]: newUser });
  }
  return newUser;
}

// Board & Task Operations
export async function getBoardTasks(dateStr: string): Promise<Task[]> {
  if (useLocalDB) {
    const db = initLocalDB();
    const board = db.boards[dateStr];
    return board ? Object.values(board).sort((a, b) => a.order - b.order) : [];
  } else {
    try {
      const boardTasksMap = await kv.hgetall<Record<string, Task>>(`board:${dateStr}`);
      if (!boardTasksMap) return [];
      return Object.values(boardTasksMap).sort((a, b) => a.order - b.order);
    } catch (e) {
      console.error(`KV Error in getBoardTasks for ${dateStr}`, e);
      return [];
    }
  }
}

export async function addTask(dateStr: string, taskData: Omit<Task, 'id' | 'updatedAt'>): Promise<Task> {
  const id = Math.random().toString(36).substring(2, 11);
  const newTask: Task = {
    ...taskData,
    id,
    updatedAt: new Date().toISOString(),
  };

  if (useLocalDB) {
    const db = initLocalDB();
    if (!db.boards[dateStr]) {
      db.boards[dateStr] = {};
    }
    db.boards[dateStr][id] = newTask;
    writeLocalDB(db);
  } else {
    await kv.hset(`board:${dateStr}`, { [id]: newTask });
  }

  return newTask;
}

export async function updateTask(
  dateStr: string,
  taskId: string,
  updates: Partial<Omit<Task, 'id' | 'userId'>>
): Promise<Task | null> {
  if (useLocalDB) {
    const db = initLocalDB();
    const board = db.boards[dateStr];
    if (!board || !board[taskId]) return null;

    const updatedTask: Task = {
      ...board[taskId],
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    board[taskId] = updatedTask;
    writeLocalDB(db);
    return updatedTask;
  } else {
    try {
      const task = await kv.hget<Task>(`board:${dateStr}`, taskId);
      if (!task) return null;

      const updatedTask: Task = {
        ...task,
        ...updates,
        updatedAt: new Date().toISOString(),
      };
      await kv.hset(`board:${dateStr}`, { [taskId]: updatedTask });
      return updatedTask;
    } catch (e) {
      console.error(`KV Error in updateTask for ${taskId}`, e);
      return null;
    }
  }
}

/**
 * Returns a sparse map of { dateStr -> completedTaskCount } for a given user
 * within a date range. Only days with at least 1 completed task appear in the map.
 *
 * Because tasks live in boards[dateStr], the board key IS the completion date —
 * no completedAt field is required on the task itself.
 *
 * @param userId   - The user to aggregate for
 * @param startDate - Inclusive start date string "YYYY-MM-DD"
 * @param endDate   - Inclusive end date string "YYYY-MM-DD"
 */
export async function getCompletedTaskCountsByUser(
  userId: string,
  startDate: string,
  endDate: string
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};

  if (useLocalDB) {
    const db = initLocalDB();
    for (const [dateStr, boardMap] of Object.entries(db.boards)) {
      // Skip dates outside the requested range
      if (dateStr < startDate || dateStr > endDate) continue;
      const doneTasks = Object.values(boardMap).filter(
        (t) => t.userId === userId && t.status === 'done'
      );
      if (doneTasks.length > 0) {
        counts[dateStr] = doneTasks.length;
      }
    }
  } else {
    // Vercel KV: boards are stored as hash keys "board:YYYY-MM-DD"
    // We scan all keys matching the pattern then filter by date range
    try {
      // kv.keys returns all matching keys; use cursor-scan for large datasets
      let cursor = 0;
      do {
        // @ts-expect-error — @vercel/kv exposes scan via the underlying ioredis client
        const [nextCursor, keys]: [number, string[]] = await kv.scan(cursor, {
          match: 'board:*',
          count: 200,
        });
        cursor = nextCursor;

        for (const key of keys) {
          const dateStr = key.replace('board:', '');
          if (dateStr < startDate || dateStr > endDate) continue;

          const boardTasksMap = await kv.hgetall<Record<string, Task>>(key);
          if (!boardTasksMap) continue;

          const doneTasks = Object.values(boardTasksMap).filter(
            (t) => t.userId === userId && t.status === 'done'
          );
          if (doneTasks.length > 0) {
            counts[dateStr] = doneTasks.length;
          }
        }
      } while (cursor !== 0);
    } catch (e) {
      console.error('KV Error in getCompletedTaskCountsByUser', e);
    }
  }

  return counts;
}

export async function deleteTask(dateStr: string, taskId: string): Promise<boolean> {
  if (useLocalDB) {
    const db = initLocalDB();
    const board = db.boards[dateStr];
    if (!board || !board[taskId]) return false;

    delete board[taskId];
    writeLocalDB(db);
    return true;
  } else {
    try {
      const deletedCount = await kv.hdel(`board:${dateStr}`, taskId);
      return deletedCount > 0;
    } catch (e) {
      console.error(`KV Error in deleteTask for ${taskId}`, e);
      return false;
    }
  }
}
