import { describe, expect, it } from 'vitest';

// Keep the config module away from any hosted database when it loads.
process.env.NODE_ENV = 'test';
process.env.SUPABASE_DB_URL = '';
process.env.SHEETS_API_URL = '';

const csv = [
  "STUDENTS' DATA,,,,",
  ',,,,',
  'AD.NO,REG. NO,NAME,PHONE,EMAIL',
  '3562,250001,Jiyad CP,,',
  '607,250002,Abdul Basith KP,,',
  '689,250006,Muhammed Sinan M,,',
  '690,250007,Muhammed Sinan M,,',
].join('\n');
process.env.ROSTER_CSV = csv;

describe('parseRosterCsv', () => {
  it('reads name from the third column (after REG. NO) and skips title/header', async () => {
    const { parseRosterCsv } = await import('../roster.js');
    const rows = parseRosterCsv(csv);
    expect(rows).toHaveLength(4);
    expect(rows[0]).toEqual({ adNo: '3562', regNo: '250001', name: 'Jiyad CP' });
  });
});

describe('findStudent', () => {
  it('matches on name + registration number, disambiguating duplicate names', async () => {
    const { findStudent } = await import('../roster.js');
    const a = await findStudent('Muhammed Sinan M', '250006');
    const b = await findStudent('Muhammed Sinan M', '250007');
    expect(a.adNo).toBe('689');
    expect(b.adNo).toBe('690');
    expect(await findStudent('Muhammed Sinan M', '250099')).toBeNull();
    expect(await findStudent('Nobody', '250001')).toBeNull();
  });
});

describe('findStudentByRegNo', () => {
  it('matches on the registration number alone', async () => {
    const { findStudentByRegNo } = await import('../roster.js');
    const a = await findStudentByRegNo('250006');
    const b = await findStudentByRegNo('250007');
    expect(a).toMatchObject({ name: 'Muhammed Sinan M', adNo: '689' });
    expect(b).toMatchObject({ name: 'Muhammed Sinan M', adNo: '690' });
    expect(await findStudentByRegNo('250099')).toBeNull();
  });
});

describe('initialPassword', () => {
  it('is the registration number followed by the admission number', async () => {
    const { initialPassword } = await import('../roster.js');
    expect(initialPassword({ regNo: '250001', adNo: '3411' })).toBe('2500013411');
  });
});

describe('usernameFromName', () => {
  it('builds a valid username from a name', async () => {
    const { usernameFromName } = await import('../roster.js');
    expect(usernameFromName('Muhammed Shamil KT')).toBe('muhammed.shamil.kt');
  });
});
