const fs = require('fs');

function convert(inPath, outPath) {
  const raw = fs.readFileSync(inPath, 'utf8');
  const obj = JSON.parse(raw);
  const header = { version: obj.version, width: obj.width, height: obj.height, timestamp: obj.timestamp, env: obj.env };
  const lines = [JSON.stringify(header)];
  for (const e of obj.stdout) {
    const t = e[0];
    const data = e[1];
    lines.push(JSON.stringify([t, 'o', data]));
  }
  fs.writeFileSync(outPath, lines.join('\n') + '\n');
}

const files = [ 'sql-editing', 'history-navigation' ];
for (const f of files) {
  convert(`docs/images/casts/${f}.cast`, `docs/images/casts/${f}.cast`);
}
console.log('Converted casts to asciicast v2 JSONL format');
