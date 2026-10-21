import { describe, expect, it } from 'vitest';
import { detectLanguage, guessTitle, knownWork, mostSimilar } from './infer';

describe('language detection', () => {
  it('scripts and function words', () => {
    expect(detectLanguage('Als Zarathustra diese Worte gesprochen hatte, sahe er wieder das Volk an und schwieg.')?.code).toBe('de');
    expect(detectLanguage('In the beginning was the Word, and the Word was with God.')?.code).toBe('en');
    expect(detectLanguage('In principio erat Verbum, et Verbum erat apud Deum, et Deus erat Verbum.')?.code).toBe('la');
    expect(detectLanguage("Au commencement était la Parole, et la Parole était avec Dieu.")?.code).toBe('fr');
    expect(detectLanguage('Ἐν ἀρχῇ ἦν ὁ λόγος, καὶ ὁ λόγος ἦν πρὸς τὸν θεόν.')?.code).toBe('grc');
    expect(detectLanguage('Στην αρχή ήταν ο Λόγος και ο Λόγος ήταν με τον Θεό.')?.code).toBe('el');
    expect(detectLanguage('בְּרֵאשִׁית בָּרָא אֱלֹהִים אֵת הַשָּׁמַיִם וְאֵת הָאָרֶץ')?.code).toBe('he');
    expect(detectLanguage('[hang:3][Red]D[/Red][/hang]ie Pflanze, die wächst, treibt einen Schoss zur Rechten')?.code).toBe('de');
  });
});

describe('title', () => {
  it('a short first line is a heading; a verse or a sentence is not', () => {
    expect(guessTitle('Vom bleichen Verbrecher\n\nIhr wollt nicht tödten, ihr Richter und Opferer')).toBe('Vom bleichen Verbrecher');
    expect(guessTitle('20 וַיְדַבֵּר אֱלֹהִים אֵת כָּל הַדְּבָרִים\n2 אָנֹכִי')).toBeNull();
    expect(guessTitle('Als Zarathustra diese Worte gesprochen hatte, sahe er wieder das Volk an und schwieg. „Da stehen sie“, sprach er.')).toBeNull();
  });
});

describe('author and work', () => {
  it('known works only in their own language', () => {
    expect(knownWork('Also sprach Zarathustra.', 'de')?.author).toBe('Friedrich Nietzsche');
    expect(knownWork('Die »Nachfolge Christi« führte mich zum Meister', 'de')).toBeNull();
    expect(knownWork('Gratia Domini nostri Iesu Christi', 'la')?.work).toBe('Latin Bible (Vulgate)');
  });

  it('the most similar library text shares the distinctive vocabulary', () => {
    const lib = [
      { id: 'z', lang: 'de', code: 'de', content: 'Zarathustra sprach zum Volke: Ich lehre euch den Übermenschen. Der Mensch ist Etwas, das überwunden werden soll. Seiltänzer, Marktplatz, Possenreisser.' },
      { id: 'j', lang: 'de', code: 'de', content: 'Der Geist der Tiefe zwang meine Seele hinab. Die Pflanze treibt einen Schoss, und das Mysterium der Wüste schweigt.' },
    ];
    const s = mostSimilar('Als Zarathustra zum Marktplatz kam, sprach er zum Volke vom Übermenschen und vom Seiltänzer.', 'de', lib);
    expect(s?.id).toBe('z');
    expect(s!.score).toBeGreaterThan(0.12);
  });
});
