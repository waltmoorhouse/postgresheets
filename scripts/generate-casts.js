const fs = require('fs');

const sqlEditing = {
  version: 2,
  width: 80,
  height: 24,
  timestamp: Math.floor(Date.now() / 1000),
  env: { TERM: 'xterm-256color', SHELL: '/bin/bash' },
  stdout: [
    [0.0, '\u001b[1mPostgreSQL SQL Terminal\u001b[0m\r\nConnected to: test (localhost:5432)\r\nDatabase: db\r\nSchema: public\r\n\r\nuser@test/db/public > '],
    [0.15, 's'], [0.3, 'e'], [0.45, 'l'], [0.6, 'e'], [0.75, 'c'], [0.9, 't'], [1.05, ' '], [1.2, '1'], [1.35, ';'],
    [1.5, '\r\n\u001b[33m(1 rows)\u001b[0m\r\n\u001b[90m(12ms)\u001b[0m\r\nuser@test/db/public > '],
    [1.8, '\u001b[32muser@test/db/public\u001b[0m > \u001b[Kselect 1;'],
    [2.0, '\u0008\u0008\u0008\u0008\u0008\u0008\u0008\u0008\u001b[4D'],
    [2.2, 'update'],
    [2.4, '\r\n\u001b[33m(0 rows)\u001b[0m\r\n\u001b[90m(3ms)\u001b[0m\r\nuser@test/db/public > ']
  ]
};

const historyNav = {
  version: 2,
  width: 80,
  height: 24,
  timestamp: Math.floor(Date.now() / 1000),
  env: { TERM: 'xterm-256color', SHELL: '/bin/bash' },
  stdout: [
    [0.0, '\u001b[1mPostgreSQL SQL Terminal\u001b[0m\r\nConnected to: test (localhost:5432)\r\nDatabase: db\r\nSchema: public\r\n\r\nuser@test/db/public > '],
    [0.1, 's'], [0.25, 'e'], [0.4, 'l'], [0.55, 'e'], [0.7, 'c'], [0.85, 't'], [1.0, ' "'], [1.15, '1'], [1.3, ';'],
    [1.45, '\r\n\u001b[33m(1 rows)\u001b[0m\r\n\u001b[90m(5ms)\u001b[0m\r\nuser@test/db/public > '],
    [1.8, '\u001b[A'],
    [1.9, '\u001b[32muser@test/db/public\u001b[0m > \u001b[Kselect 1;'],
    [2.1, '\r\n']
  ]
};

fs.writeFileSync('docs/images/casts/sql-editing.cast', JSON.stringify(sqlEditing));
fs.writeFileSync('docs/images/casts/history-navigation.cast', JSON.stringify(historyNav));
console.log('Casts regenerated');
