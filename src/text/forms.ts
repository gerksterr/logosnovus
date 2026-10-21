// Forms of the same word, without any model: "sah", "sahe" and "gesehen" are
// forms of "sehen"; "λόγου" of "λόγος"; "לֹֽ֣א" is "לא". groupKey() gives
// every form of a word the same key: a lemma when one is known (the lemma
// table filled by clarifications or by hand, German strong verbs), else the
// word itself, normalized and stemmed. It errs on the side of grouping less:
// a wrong group shows a wrong translation, a missing one only an empty sheet.

const VOWELS_DE = 'aeiouyäöü';

/** Language-specific spelling normalization (accents and reading marks that do not change the word). */
export function normalize(word: string, code = ''): string {
  let w = word.normalize('NFC').toLowerCase().replace(/[’'ʼ᾽]/g, '');
  if (code === 'he' || code === 'arc' || /[֐-׿]/.test(w)) {
    w = w.replace(/[֑-ׇֽֿׁׂׅׄ־]/g, '');
    w = w.replace(/[ךםןףץ]/g, (c) => ({ ך: 'כ', ם: 'מ', ן: 'נ', ף: 'פ', ץ: 'צ' })[c]!);
  } else if (code === 'grc' || code === 'el' || /[Ͱ-Ͽἀ-῿]/.test(w)) {
    w = w.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ς/g, 'σ').normalize('NFC');
  } else if (code === 'de') {
    // old spellings (Thür, thun, Muth) — not across compound seams (Aufent·halt)
    w = w.replace(/ß/g, 'ss').replace(/^th/, 't').replace(/([aeiouäöü])th/g, '$1t');
  }
  return w;
}

// ---------------------------------------------------------------- German

/** The Snowball German stemmer (snowballstem.org/algorithms/german). Input: lower case, ß already ss. */
export function stemGerman(word: string): string {
  let w = word;
  // u and y between vowels act as consonants
  w = w.replace(/([aeiouyäöü])u([aeiouyäöü])/g, '$1U$2').replace(/([aeiouyäöü])y([aeiouyäöü])/g, '$1Y$2');
  const isV = (c: string) => VOWELS_DE.includes(c);
  const region = (from: number) => {
    for (let i = from + 1; i < w.length; i++) if (!isV(w[i]) && isV(w[i - 1])) return i + 1;
    return w.length;
  };
  let r1 = Math.max(3, region(0));
  const r2 = region(region(0));
  r1 = Math.min(r1, w.length);
  const inR = (suffix: string, r: number) => w.endsWith(suffix) && w.length - suffix.length >= r;
  // step 1
  const m = ['ern', 'em', 'er', 'en', 'es', 'e'].filter((s) => w.endsWith(s)).sort((a, b) => b.length - a.length)[0] ?? (/[bdfghklmnrt]s$/.test(w) ? 's' : '');
  if (m && inR(m, r1)) {
    w = w.slice(0, -m.length);
    if ((m === 'en' || m === 'es' || m === 'e') && w.endsWith('niss')) w = w.slice(0, -1);
  }
  // step 2
  const s2 = ['est', 'en', 'er'].find((s) => w.endsWith(s));
  if (s2 && inR(s2, r1)) w = w.slice(0, -s2.length);
  else if (/[bdfghklmnt]st$/.test(w) && w.length - 2 >= 4 && inR('st', r1)) w = w.slice(0, -2);
  // step 3: derivational suffixes
  const d = ['isch', 'lich', 'heit', 'keit', 'end', 'ung', 'ig', 'ik'].filter((s) => w.endsWith(s)).sort((a, b) => b.length - a.length)[0];
  if (d && inR(d, r2)) {
    if (d === 'end' || d === 'ung') {
      w = w.slice(0, -d.length);
      if (w.endsWith('ig') && !w.endsWith('eig') && w.length - 2 >= r2) w = w.slice(0, -2);
    } else if (d === 'ig' || d === 'ik' || d === 'isch') {
      if (!w.slice(0, -d.length).endsWith('e')) w = w.slice(0, -d.length);
    } else if (d === 'lich' || d === 'heit') {
      w = w.slice(0, -d.length);
      if ((w.endsWith('er') || w.endsWith('en')) && w.length - 2 >= r1) w = w.slice(0, -2);
    } else if (d === 'keit') {
      w = w.slice(0, -4);
      const p = ['lich', 'ig'].find((s) => w.endsWith(s));
      if (p && w.length - p.length >= r2) w = w.slice(0, -p.length);
    }
  }
  return w.replace(/U/g, 'u').replace(/Y/g, 'y').replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u');
}

// infinitive | 3rd person present (if the stem changes) | preterite | past participle
// Irregular subjunctives are listed after a semicolon on the preterite.
const STRONG = `
backen|bäckt|buk|gebacken
befehlen|befiehlt|befahl|befohlen
beginnen||begann|begonnen
beißen||biss|gebissen
bergen|birgt|barg|geborgen
bewegen||bewog|bewogen
biegen||bog|gebogen
bieten||bot|geboten
binden||band|gebunden
bitten||bat|gebeten
blasen|bläst|blies|geblasen
bleiben||blieb|geblieben
braten|brät|briet|gebraten
brechen|bricht|brach|gebrochen
brennen||brannte;brennte|gebrannt
bringen||brachte;brächte|gebracht
denken||dachte;dächte|gedacht
dreschen|drischt|drosch|gedroschen
dringen||drang|gedrungen
dürfen|darf|durfte;dürfte|gedurft
empfehlen|empfiehlt|empfahl|empfohlen
erlöschen|erlischt|erlosch|erloschen
erschrecken|erschrickt|erschrak|erschrocken
essen|isst|aß|gegessen
fahren|fährt|fuhr|gefahren
fallen|fällt|fiel|gefallen
fangen|fängt|fing|gefangen
fechten|ficht|focht|gefochten
finden||fand|gefunden
flechten|flicht|flocht|geflochten
fliegen||flog|geflogen
fliehen||floh|geflohen
fließen||floss|geflossen
fressen|frisst|fraß|gefressen
frieren||fror|gefroren
gären||gor|gegoren
gebären|gebiert|gebar|geboren
geben|gibt|gab|gegeben
gedeihen||gedieh|gediehen
gehen||ging|gegangen
gelingen||gelang|gelungen
gelten|gilt|galt|gegolten
genesen||genas|genesen
genießen||genoss|genossen
geschehen|geschieht|geschah|geschehen
gewinnen||gewann;gewönne|gewonnen
gießen||goss|gegossen
gleichen||glich|geglichen
gleiten||glitt|geglitten
graben|gräbt|grub|gegraben
greifen||griff|gegriffen
haben|hat|hatte;hätte|gehabt
halten|hält|hielt|gehalten
hängen||hing|gehangen
hauen||hieb|gehauen
heben||hob|gehoben
heißen||hieß|geheißen
helfen|hilft|half;hülfe|geholfen
kennen||kannte;kennte|gekannt
klingen||klang|geklungen
kommen||kam|gekommen
können|kann|konnte;könnte|gekonnt
kriechen||kroch|gekrochen
laden|lädt|lud|geladen
lassen|lässt|ließ|gelassen
laufen|läuft|lief|gelaufen
leiden||litt|gelitten
leihen||lieh|geliehen
lesen|liest|las|gelesen
liegen||lag|gelegen
lügen||log|gelogen
meiden||mied|gemieden
melken||molk|gemolken
messen|misst|maß|gemessen
misslingen||misslang|misslungen
mögen|mag|mochte;möchte|gemocht
müssen|muss|musste;müsste|gemusst
nehmen|nimmt|nahm|genommen
nennen||nannte;nennte|genannt
pfeifen||pfiff|gepfiffen
preisen||pries|gepriesen
quellen|quillt|quoll|gequollen
raten|rät|riet|geraten
reiben||rieb|gerieben
reißen||riss|gerissen
reiten||ritt|geritten
rennen||rannte;rennte|gerannt
riechen||roch|gerochen
ringen||rang|gerungen
rinnen||rann|geronnen
rufen||rief|gerufen
saufen|säuft|soff|gesoffen
saugen||sog|gesogen
schaffen||schuf|geschaffen
scheiden||schied|geschieden
scheinen||schien|geschienen
schelten|schilt|schalt|gescholten
scheren||schor|geschoren
schieben||schob|geschoben
schießen||schoss|geschossen
schlafen|schläft|schlief|geschlafen
schlagen|schlägt|schlug|geschlagen
schleichen||schlich|geschlichen
schließen||schloss|geschlossen
schlingen||schlang|geschlungen
schmeißen||schmiss|geschmissen
schmelzen|schmilzt|schmolz|geschmolzen
schneiden||schnitt|geschnitten
schreiben||schrieb|geschrieben
schreien||schrie|geschrien
schreiten||schritt|geschritten
schweigen||schwieg|geschwiegen
schwellen|schwillt|schwoll|geschwollen
schwimmen||schwamm|geschwommen
schwinden||schwand|geschwunden
schwingen||schwang|geschwungen
schwören||schwor|geschworen
sehen|sieht|sah|gesehen
senden||sandte|gesandt
singen||sang|gesungen
sinken||sank|gesunken
sinnen||sann|gesonnen
sitzen||saß|gesessen
sollen|soll|sollte|gesollt
spinnen||spann|gesponnen
sprechen|spricht|sprach|gesprochen
sprießen||spross|gesprossen
springen||sprang|gesprungen
stechen|sticht|stach|gestochen
stehen||stand;stände|gestanden
stehlen|stiehlt|stahl|gestohlen
steigen||stieg|gestiegen
sterben|stirbt|starb;stürbe|gestorben
stinken||stank|gestunken
stoßen|stößt|stieß|gestoßen
streichen||strich|gestrichen
streiten||stritt|gestritten
tragen|trägt|trug|getragen
treffen|trifft|traf|getroffen
treiben||trieb|getrieben
treten|tritt|trat|getreten
trinken||trank|getrunken
trügen||trog|getrogen
tun|tut|tat|getan
verderben|verdirbt|verdarb|verdorben
vergessen|vergisst|vergaß|vergessen
verlieren||verlor|verloren
wachsen|wächst|wuchs|gewachsen
waschen|wäscht|wusch|gewaschen
weichen||wich|gewichen
weisen||wies|gewiesen
wenden||wandte|gewandt
werben|wirbt|warb|geworben
werden|wird|wurde|geworden
werfen|wirft|warf|geworfen
wiegen||wog|gewogen
winden||wand|gewunden
wissen|weiß|wusste;wüsste|gewusst
wollen|will|wollte|gewollt
ziehen||zog|gezogen
zwingen||zwang|gezwungen`;

// forms that the pattern above does not produce (old spellings included)
const EXTRA: Record<string, string> = {
  bin: 'sein', bist: 'sein', ist: 'sein', sind: 'sein', seid: 'sein', war: 'sein', warst: 'sein', waren: 'sein', wart: 'sein', gewesen: 'sein',
  sei: 'sein', seist: 'sein', seien: 'sein', seiet: 'sein', wäre: 'sein', wären: 'sein', wärest: 'sein', wärst: 'sein', wäret: 'sein', seiend: 'sein', seyn: 'sein',
  hast: 'haben', habe: 'haben', habt: 'haben', wirst: 'werden', ward: 'werden', worden: 'werden', würde: 'werden', würden: 'werden', würdest: 'werden',
  weißt: 'wissen', wußte: 'wissen', gewußt: 'wissen', wüßte: 'wissen', muß: 'müssen', mußte: 'müssen', müßte: 'müssen', gemußt: 'müssen',
  giebt: 'geben', gieb: 'geben', stund: 'stehen', stunden: 'stehen', tue: 'tun', tust: 'tun', täte: 'tun', taten: 'tun', ißt: 'essen', läßt: 'lassen', ließest: 'lassen',
};

const SEPARABLE = 'zusammen zurück vorüber vorbei voran hinunter hinauf hinaus hinein herunter herauf heraus herein hervor entgegen empor nieder wieder weiter fort heim hinzu dazu davon dahin daher dar an auf aus bei ein mit nach vor weg zu los hin her ab um durch über unter'.split(' ');
const INSEPARABLE = 'miss emp ent ver zer be er ge'.split(' ');

const umlaut = (s: string) => s.replace(/au/, 'äu').replace(/[aou]/, (c) => ({ a: 'ä', o: 'ö', u: 'ü' })[c]!);

let strongMap: Map<string, string> | null = null;
function strongForms(): Map<string, string> {
  if (strongMap) return strongMap;
  const m = new Map<string, string>();
  const add = (form: string, inf: string) => !m.has(form) && m.set(form, inf);
  for (const line of STRONG.trim().split('\n')) {
    const [inf, pres3, pretField, pp] = line.split('|');
    const [pret, subjGiven] = pretField.split(';');
    const stem = inf.endsWith('en') ? inf.slice(0, -2) : inf.slice(0, -1);
    for (const e of ['', 'e', 'st', 'est', 't', 'et', 'en', 'end', 'ende', 'enden', 'ender', 'endes', 'endem']) add(stem + e, inf);
    add(inf, inf);
    if (pres3) {
      add(pres3, inf);
      if (pres3.endsWith('t')) {
        add(pres3.slice(0, -1) + (/(s|ß|z)$/.test(pres3.slice(0, -1)) ? 't' : 'st'), inf);
        add(pres3.slice(0, -1), inf); // imperative: sieh, gib, nimm
      }
    }
    const weakPret = pret.endsWith('te');
    for (const e of weakPret ? ['', 'st', 'n', 't', 'est', 'en', 'et'] : ['', 'st', 'est', 'en', 't', 'et', 'e']) add(pret + e, inf);
    const subj = subjGiven ?? (weakPret ? pret : `${umlaut(pret)}e`);
    for (const e of ['', 'st', 'n', 't']) add(subj + e, inf);
    for (const e of ['', 'e', 'en', 'er', 'es', 'em']) add(pp + e, inf);
  }
  for (const [f, inf] of Object.entries(EXTRA)) m.set(f, inf);
  strongMap = m;
  return m;
}

/** Infinitive of a German strong or irregular verb form, prefixes included ("nachging" → "nachgehen"). */
export function germanStrongLemma(word: string): string | null {
  const w = word.toLowerCase();
  const m = strongForms();
  const direct = m.get(w);
  if (direct) return direct;
  for (const p of [...SEPARABLE, ...INSEPARABLE]) {
    if (!w.startsWith(p) || w.length - p.length < 2) continue;
    let rest = w.slice(p.length);
    if (SEPARABLE.includes(p) && rest.startsWith('zu') && m.has(rest.slice(2)) && m.get(rest.slice(2)) === rest.slice(2)) rest = rest.slice(2); // aufzustehen
    const inf = m.get(rest);
    if (inf && inf !== 'sein' && inf !== 'haben' && inf !== 'werden') return p + inf;
  }
  return null;
}

/** German stem with weak-verb endings folded in (lacht, lachte, gelacht → lach) for lower-case words. */
function stemDe(norm: string, original: string): string {
  let s = stemGerman(norm);
  const lower = original[0] === original[0]?.toLowerCase();
  if (lower && s.length >= 4) {
    if (s.endsWith('end') && s.length >= 6) s = s.slice(0, -3); // present participle: lachend
    else if (/^ge.{3,}t$/.test(s)) s = s.slice(2, -1); // weak past participle
    else if (/[^aeiouäöü]t$/.test(s) || /[aeiouäöü]ht$/.test(s)) s = s.slice(0, -1);
  }
  return s;
}

// ---------------------------------------------------------------- other languages (light)

const GREEK_ENDINGS = 'ομενοσ ομενη ομενον ουμεθα εσθαι ονται ουσιν ουσι ομεθα ουσα ομεν ετε ουσ οισ ων ου ον οσ οι ασ αισ αι ησ η α ω ει εισ εσ ιν ισ ι υσ ειν σαν σεν σε σα σασ'
  .split(' ')
  .sort((a, b) => b.length - a.length);
const LATIN_ENDINGS = 'ibus orum arum ebus ius ium ibus ura ure aris atur amus atis ant ent unt are ere ire us um is ae am as os es em ui o a e i'
  .split(' ')
  .sort((a, b) => b.length - a.length);

function stripEnding(w: string, endings: string[], keep: number): string {
  for (const e of endings) if (w.endsWith(e) && w.length - e.length >= keep) return w.slice(0, -e.length);
  return w;
}

function stemEnglish(w: string): string {
  if (w.length <= 4) return w;
  if (/ies$/.test(w)) return w.slice(0, -3) + 'y';
  if (/(ss|us)$/.test(w)) return w;
  for (const [re, rep] of [[/ing$/, ''], [/ed$/, ''], [/ly$/, ''], [/es$/, ''], [/s$/, '']] as const) if (re.test(w) && w.replace(re, rep).length >= 3) return w.replace(re, rep);
  return w;
}

/** Hebrew: a conjunction or article prefix (ו, ה, וה) is not part of the word. */
function stemHebrew(w: string): string {
  if (w.length >= 5 && /^וה/.test(w)) return w.slice(2);
  if (w.length >= 4 && /^[וה]/.test(w)) return w.slice(1);
  return w;
}

// ---------------------------------------------------------------- the group key

/** Lemma of a normalized form; '=form' marks a word that must not be grouped with others. */
export type LemmaLookup = (normForm: string) => string | undefined;

/** Key shared by all forms of a word in a language (code: the language's BCP-47-ish code). */
export function groupKey(word: string, code = '', lemmaOf?: LemmaLookup): string {
  const norm = normalize(word, code);
  const known = lemmaOf?.(norm);
  if (known?.startsWith('=')) return known; // marked as a word of its own: no grouping
  const lang = code.split('-')[0];
  if (lang === 'de' || (!lang && /[äöüß]/.test(norm))) {
    const lemma = known ?? germanStrongLemma(norm);
    return lemma ? stemDe(normalize(lemma, 'de'), lemma) : stemDe(norm, word);
  }
  const base = known ? normalize(known, code) : norm;
  if (lang === 'grc' || lang === 'el' || /[Ͱ-Ͽ]/.test(base)) return stripEnding(base, GREEK_ENDINGS, 3);
  if (lang === 'he' || lang === 'arc' || /[֐-׿]/.test(base)) return stemHebrew(base);
  if (lang === 'la') return stripEnding(base, LATIN_ENDINGS, 3);
  if (lang === 'en') return stemEnglish(base);
  return base;
}
