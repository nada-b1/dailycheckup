const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, '..', '.data', 'db.json');

if (!fs.existsSync(dbPath)) {
  console.error('Database file not found at:', dbPath);
  process.exit(1);
}

const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

let removedCount = 0;
let remainingCount = 0;

for (const [dateStr, board] of Object.entries(db.boards || {})) {
  for (const taskId of Object.keys(board)) {
    if (taskId.startsWith('mock_')) {
      delete board[taskId];
      removedCount++;
    } else {
      remainingCount++;
    }
  }
  // If the board date has no tasks left, clean up the date key
  if (Object.keys(board).length === 0) {
    delete db.boards[dateStr];
  }
}

fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf8');

console.log(`\n✅ Cleaned up mock data from .data/db.json`);
console.log(`   - Removed mock tasks: ${removedCount}`);
console.log(`   - Retained real tasks: ${remainingCount}`);
console.log(`   - Remaining dates: ${Object.keys(db.boards).length}`);
