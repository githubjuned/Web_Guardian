import { customAlphabet } from 'nanoid';

const alphabet = '0123456789abcdefghijklmnopqrstuvwxyz';
const make = customAlphabet(alphabet, 10);

export const newId = (prefix: 'audit' | 'issue' | 'ver' | 'sbx') => `${prefix}_${make()}`;
export const nowIso = () => new Date().toISOString();
