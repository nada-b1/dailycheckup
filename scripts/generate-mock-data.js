const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, '..', '.data', 'db.json');

if (!fs.existsSync(dbPath)) {
  console.error('Database file not found at:', dbPath);
  process.exit(1);
}

const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

// 1. First, strip any existing mock tasks to ensure a fresh, consistent test dataset
for (const [dateStr, board] of Object.entries(db.boards || {})) {
  for (const taskId of Object.keys(board)) {
    if (taskId.startsWith('mock_')) {
      delete board[taskId];
    }
  }
  if (Object.keys(board).length === 0) {
    delete db.boards[dateStr];
  }
}

// 2. Identify users
const users = Object.values(db.users || {});
if (users.length === 0) {
  console.error('No users found in database!');
  process.exit(1);
}

const user1 = users.find(u => u.name.toLowerCase().includes('abdel')) || users[0];
const user2 = users.find(u => u.id !== user1.id) || users[1];

console.log(`Generating mock task data for:`);
console.log(`  User 1: ${user1.name} (id: ${user1.id}, color: ${user1.color})`);
if (user2) {
  console.log(`  User 2: ${user2.name} (id: ${user2.id}, color: ${user2.color})`);
}

// 3. Date range: past 150 days up to 2026-10-07
const today = new Date('2026-10-07T12:00:00Z');
const daysCount = 150;

function getLevel(count) {
  if (count <= 0) return 0;
  if (count < 3) return 1; // 1-2
  if (count < 5) return 2; // 3-4
  if (count < 7) return 3; // 5-6
  return 4;                // 7+
}

// Level pickers designed to give different rhythms for each user
function pickCountUser1(dayIndex, dayOfWeek) {
  // Abdel moumen: High activity mid-week (Tue/Thu), lower on weekends
  const roll = Math.random();
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    // Weekend: 60% chance of 0, 40% chance of 1-3
    if (roll < 0.60) return 0;
    return Math.floor(Math.random() * 3) + 1; // 1-3
  }
  // Weekday distribution:
  // Level 0 (0): 20%
  // Level 1 (1-2): 30%
  // Level 2 (3-4): 25%
  // Level 3 (5-6): 15%
  // Level 4 (7-10): 10%
  if (roll < 0.20) return 0;
  if (roll < 0.50) return Math.floor(Math.random() * 2) + 1; // 1-2 (Level 1)
  if (roll < 0.75) return Math.floor(Math.random() * 2) + 3; // 3-4 (Level 2)
  if (roll < 0.90) return Math.floor(Math.random() * 2) + 5; // 5-6 (Level 3)
  return Math.floor(Math.random() * 4) + 7;                  // 7-10 (Level 4)
}

function pickCountUser2(dayIndex, dayOfWeek) {
  // nada: Different rhythm (stronger Wed/Fri/Sun, lighter Mon)
  const roll = Math.random();
  if (dayOfWeek === 1) { // Monday light
    if (roll < 0.55) return 0;
    return Math.floor(Math.random() * 2) + 1; // 1-2
  }
  // Alternate distribution:
  // Level 0 (0): 25%
  // Level 1 (1-2): 25%
  // Level 2 (3-4): 20%
  // Level 3 (5-6): 15%
  // Level 4 (7-11): 15%
  if (roll < 0.25) return 0;
  if (roll < 0.50) return Math.floor(Math.random() * 2) + 1; // 1-2 (Level 1)
  if (roll < 0.70) return Math.floor(Math.random() * 2) + 3; // 3-4 (Level 2)
  if (roll < 0.85) return Math.floor(Math.random() * 2) + 5; // 5-6 (Level 3)
  return Math.floor(Math.random() * 5) + 7;                  // 7-11 (Level 4)
}

const statsUser1 = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, totalTasks: 0, activeDays: 0 };
const statsUser2 = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, totalTasks: 0, activeDays: 0 };

for (let i = daysCount; i >= 0; i--) {
  const d = new Date(today);
  d.setDate(d.getDate() - i);
  const dateStr = d.toISOString().split('T')[0];
  const dayOfWeek = d.getDay();

  if (!db.boards[dateStr]) {
    db.boards[dateStr] = {};
  }

  // Count for User 1
  let count1 = pickCountUser1(i, dayOfWeek);
  // Count for User 2
  let count2 = user2 ? pickCountUser2(i, dayOfWeek) : 0;

  // Preserve real tasks if any exist on this date
  const existingUser1Real = Object.values(db.boards[dateStr]).filter(t => !t.id.startsWith('mock_') && t.userId === user1.id && t.status === 'done').length;
  const existingUser2Real = user2 ? Object.values(db.boards[dateStr]).filter(t => !t.id.startsWith('mock_') && t.userId === user2.id && t.status === 'done').length : 0;

  const mockTasksToCreate1 = Math.max(0, count1 - existingUser1Real);
  const totalCount1 = existingUser1Real + mockTasksToCreate1;

  for (let k = 0; k < mockTasksToCreate1; k++) {
    const id = `mock_${user1.id}_${dateStr}_${k}`;
    db.boards[dateStr][id] = {
      id,
      userId: user1.id,
      text: `Mock task ${k + 1} (${user1.name})`,
      status: 'done',
      order: k,
      updatedAt: `${dateStr}T${String(10 + (k % 8)).padStart(2, '0')}:${String((k * 7) % 60).padStart(2, '0')}:00.000Z`
    };
  }

  statsUser1[getLevel(totalCount1)]++;
  statsUser1.totalTasks += totalCount1;
  if (totalCount1 > 0) statsUser1.activeDays++;

  if (user2) {
    const mockTasksToCreate2 = Math.max(0, count2 - existingUser2Real);
    const totalCount2 = existingUser2Real + mockTasksToCreate2;

    for (let k = 0; k < mockTasksToCreate2; k++) {
      const id = `mock_${user2.id}_${dateStr}_${k}`;
      db.boards[dateStr][id] = {
        id,
        userId: user2.id,
        text: `Mock task ${k + 1} (${user2.name})`,
        status: 'done',
        order: k,
        updatedAt: `${dateStr}T${String(10 + (k % 8)).padStart(2, '0')}:${String((k * 9) % 60).padStart(2, '0')}:00.000Z`
      };
    }

    statsUser2[getLevel(totalCount2)]++;
    statsUser2.totalTasks += totalCount2;
    if (totalCount2 > 0) statsUser2.activeDays++;
  }
}

fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf8');

console.log('\n📊 MOCK DATA GENERATION COMPLETE:');
console.log(`\n▶ User 1: ${user1.name} (${user1.color})`);
console.log(`   - Total Completed Tasks: ${statsUser1.totalTasks}`);
console.log(`   - Active Days: ${statsUser1.activeDays} / ${daysCount + 1}`);
console.log(`   - Level 0 (0 tasks):  ${statsUser1[0]} days`);
console.log(`   - Level 1 (1-2 tasks): ${statsUser1[1]} days`);
console.log(`   - Level 2 (3-4 tasks): ${statsUser1[2]} days`);
console.log(`   - Level 3 (5-6 tasks): ${statsUser1[3]} days`);
console.log(`   - Level 4 (7+ tasks):  ${statsUser1[4]} days`);

if (user2) {
  console.log(`\n▶ User 2: ${user2.name} (${user2.color})`);
  console.log(`   - Total Completed Tasks: ${statsUser2.totalTasks}`);
  console.log(`   - Active Days: ${statsUser2.activeDays} / ${daysCount + 1}`);
  console.log(`   - Level 0 (0 tasks):  ${statsUser2[0]} days`);
  console.log(`   - Level 1 (1-2 tasks): ${statsUser2[1]} days`);
  console.log(`   - Level 2 (3-4 tasks): ${statsUser2[2]} days`);
  console.log(`   - Level 3 (5-6 tasks): ${statsUser2[3]} days`);
  console.log(`   - Level 4 (7+ tasks):  ${statsUser2[4]} days`);
}

console.log('\n✅ Successfully saved to .data/db.json');
