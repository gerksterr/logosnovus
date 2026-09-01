import { QueryBlueprint, TextItem } from '../types';

export const DEFAULT_BLUEPRINTS: QueryBlueprint[] = [
  {
    id: 'wp-german-etymology-default',
    name: 'Historical German Etymology & Roots',
    type: 'word',
    template: 'Very brief composite construction, etymology and historical development of the (Biblical-) German word: {word} in/until the early 20th century.',
    description: 'Etymology, root construction, and historical development of German/Biblical words up to early 20th century.',
    isDefault: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'wp-jung-symbolic-word',
    name: 'Carl Jung Esoteric & Archetypal Word',
    type: 'word',
    template: 'Provide the esoteric, alchemical, and analytical-psychological symbolic nuances of the word "{word}" in the context of early 20th century German mysticism and Carl Jung\'s Red Book.',
    description: 'Deep symbolic breakdown of individual words in Jungian/Alchemical context.',
    isDefault: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'wp-literal-grammar-word',
    name: 'Literal Morphology & Grammar',
    type: 'word',
    template: 'Deconstruct the grammatical components, prefix/suffix roots, literal translation, and base form of the word: {word}.',
    description: 'Quick grammatical and morphological literal breakdown.',
    isDefault: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'pp-jung-red-book-default',
    name: 'Carl Jung Red Book Symbolic Interpretation',
    type: 'passage',
    template: "Shed light on the -strictly symbolic- contemporary meanings of the original piece of text '{text}' from Carl Jung's Red Book, only providing information necessary to derive personal interpretations for a person who doesn't speak German.",
    description: 'Strictly symbolic and archetypal breakdown of passages tailored for non-German speakers.',
    isDefault: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'pp-alchemical-hermetic',
    name: 'Alchemical & Hermetic Exegesis',
    type: 'passage',
    template: "Examine the hermetic, alchemical, and mystical allegories present within this text: '{text}'. Identify hidden symbols, cosmic dualities, and spiritual motifs.",
    description: 'Focuses on alchemical, hermetic, and spiritual symbolism.',
    isDefault: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'pp-literal-vs-allegorical',
    name: 'Literal vs. Allegorical Dual Analysis',
    type: 'passage',
    template: "For the original text '{text}', provide a two-part breakdown: 1) Precise literal translation into English, and 2) The allegorical/metaphorical layer underlying the passage.",
    description: 'Provides side-by-side literal translation and allegorical layer.',
    isDefault: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'wp-hebrew-roots-default',
    name: 'Hebrew Root (Shoresh) & Etymology',
    type: 'word',
    template: 'Analyze the biblical/classical Hebrew word: "{word}". Identify its 3-letter root (Shoresh שורש), morphological binyan, literal grammatical translation, and symbolic/Kabbalistic or theological significance.',
    description: 'Deconstructs Hebrew words into trilateral root (shoresh), binyan, and symbolic depth.',
    isDefault: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'pp-hebrew-kabbalistic',
    name: 'Hebrew & Kabbalistic Passage Exegesis',
    type: 'passage',
    template: 'For the original Hebrew passage "{text}", provide: 1) A literal word-for-word and fluid English translation in proper sequence, 2) Grammatical nuances, and 3) Symbolic, mystical (Pardes/Kabbalistic), and contextual interpretation.',
    description: 'Rigorous word-by-word sequence and mystical/symbolic Hebrew exegesis.',
    isDefault: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
];

export const SAMPLE_TEXTS: TextItem[] = [
  {
    id: 'text-sefer-yetzirah-hebrew',
    title: "ספר יצירה – Sefer Yetzirah (The Book of Formation)",
    author: "Traditional / Abraham",
    language: "Hebrew",
    tags: ["Hebrew", "Kabbalah", "Mysticism", "Sefer Yetzirah", "Cosmology"],
    wordBlueprintId: "wp-hebrew-roots-default",
    passageBlueprintId: "pp-hebrew-kabbalistic",
    notes: "Chapter 1: The 32 Mystical Paths of Wisdom and the Ten Sefirot.",
    content: `בִּשְׁלֹשִׁים וּשְׁתַּיִם נְתִיבוֹת פְּלִיאוֹת חָכְמָה חָקַק יָהּ יְהֹוָה צְבָאוֹת אֱלֹהֵי יִשְׂרָאֵל אֱלֹהִים חַיִּים וּמֶלֶךְ עוֹלָם אֵל שַׁדַּי רַחוּם וְחַנּוּן רָם וְנִשָּׂא שׁוֹכֵן עַד וְקָדוֹשׁ שְׁמוֹ מָרוֹם וְקָדוֹשׁ הוּא.

וּבָרָא אֶת עוֹלָמוֹ בִּשְׁלֹשָׁה סְפָרִים: בְּסֵפֶר וּסְפָר וְסִפּוּר.

עֶשֶׂר סְפִירוֹת בְּלִימָה וְעֶשְׂרִים וּשְׁתַּיִם אוֹתִיּוֹת יְסוֹד: שָׁלֹשׁ אִמּוֹת, שֶׁבַע כְּפוּלוֹת, וּשְׁתֵּים עֶשְׂרֵה פְּשׁוּטוֹת. עֶשֶׂר סְפִירוֹת בְּלִימָה, בְּלֹם פִּיךָ מִלְּדַבֵּר וְלִבְּךָ מִלְּהַרְהֵר, וְאִם רָץ פִּיךָ לְדַבֵּר וְלִבְּךָ לְהַרְהֵר, שׁוּב לִמְקוֹם.`,
    createdAt: '2024-01-01T08:00:00.000Z',
    updatedAt: '2024-01-01T08:00:00.000Z',
  },
  {
    id: 'text-jung-liber-novus-1',
    title: "Carl Jung – Liber Novus (The Red Book: Liber Primus)",
    author: "Carl Gustav Jung",
    language: "German",
    tags: ["Red Book", "Jungian", "Psychology", "Symbolism", "German"],
    wordBlueprintId: "wp-german-etymology-default",
    passageBlueprintId: "pp-jung-red-book-default",
    notes: "Liber Primus, Chapter 1: The Way of What Is to Come (Der Weg des Kommenden).",
    content: `Wenn ich von dem Geist dieser Zeit spreche, so muss ich sagen: er ist ein großer Herrscher, voll von Kraft und Gewalttat. Er fordert Nutzwert und Leistung. Aber der Geist der Tiefe verlangt etwas anderes. Er führt mich hinab in die dunklen Höhlen des Unbewussten, wo die alten Symbole schlafen.

"Die Seele, mein Freund, ist kein Bild, das man an die Wand hängt; sie ist eine Wüste, voll von Schlangen und Skorpionen, und doch ist sie der Ort, an dem die lebendige Quelle entspringt."

Als ich diese Worte niederschrieb, wusste ich nicht, dass die Gestalten meiner Phantasie nicht nur Traumbilder waren, sondern autonome Wesen des kollektiven Unbewussten. Philemon trat zu mir und sprach von dem Bild der Wandlung, das im Geheimnis der Nacht verborgen liegt.`,
    createdAt: '2024-01-01T12:00:00.000Z',
    updatedAt: '2024-01-01T12:00:00.000Z',
  },
  {
    id: 'text-nietzsche-zarathustra-vorrede',
    title: "Nietzsche – Zarathustras Vorrede (Der letzte Mensch)",
    author: "Friedrich Nietzsche",
    language: "German",
    tags: ["Philosophy", "Nietzsche", "Zarathustra", "German", "Separable Verbs"],
    wordBlueprintId: "wp-german-etymology-default",
    passageBlueprintId: "pp-jung-red-book-default",
    notes: "Zarathustras Vorrede §5: On 'Bildung' and 'Der letzte Mensch'. Contains classic separated verb 'zeichnet ... aus' (auszeichnen).",
    content: `Bildung nennen sie’s, es zeichnet sie aus vor den Ziegenhirten. Drum hören sie es ungern, wenn man von Verachtung spricht. Also rede ich denn zu ihrem Stolze: also rede ich ihnen vom Verächtlichsten: das aber ist der letzte Mensch.
Also sprach Zarathustra zum Volke.`,
    createdAt: '2024-01-01T10:00:00.000Z',
    updatedAt: '2024-01-01T10:00:00.000Z',
  },
  {
    id: 'text-nietzsche-zarathustra',
    title: "Nietzsche – Also sprach Zarathustra (Von den drei Verwandlungen)",
    author: "Friedrich Nietzsche",
    language: "German",
    tags: ["Philosophy", "Nietzsche", "Symbolism", "German"],
    wordBlueprintId: "wp-german-etymology-default",
    passageBlueprintId: "pp-jung-red-book-default",
    notes: "The Three Metamorphoses of the Spirit: Camel, Lion, Child.",
    content: `Drei Verwandlungen nenne ich euch des Geistes: wie der Geist zum Kamele wird, und zum Löwen das Kamel, und zum Kinde endlich der Löwe.

Vieles Schwere gibt es dem Geiste, dem starken, belastbaren Geiste, welchem Ehrfurcht einwohnt: nach dem Schwersten und Schwersten verlangt seine Stärke.

Was ist schwer? so fragt der belastbare Geist, so kniet er nieder, dem Kamele gleich, und will gut beladen sein. Was ist das Schwerste, ihr Helden? so fragt der belastbare Geist, dass ich es auf mich nehme und meiner Stärke froh werde.

Aber in der einsamsten Wüste geschieht die zweite Verwandlung: zum Löwen wird hier der Geist, Freiheit will er sich erbeuten und Herr sein in seiner eigenen Wüste.`,
    createdAt: '2024-01-02T12:00:00.000Z',
    updatedAt: '2024-01-02T12:00:00.000Z',
  },
  {
    id: 'text-paracelsus-alchemy',
    title: "Paracelsus – Philosophia ad Athenienses (Alchemical Fragment)",
    author: "Paracelsus (Theophrastus von Hohenheim)",
    language: "German / Early Modern",
    tags: ["Alchemy", "Hermetic", "Paracelsus", "Esoteric"],
    wordBlueprintId: "wp-german-etymology-default",
    passageBlueprintId: "pp-alchemical-hermetic",
    notes: "Early modern alchemical text regarding Prima Materia and Quinta Essentia.",
    content: `Das Mysterium Magnum ist das Mütterliche Aller Dinge, darin alle Geschöpf gelegen haben als in einer Samen-Gestalt. Aus dem Mysterio Magnum entspringen die vier Elemente: Feuer, Luft, Wasser und Erde.

In der Prima Materia liegt die verborgene Krut und das Geheimnis der Tinctur. Wer das Mercurium nicht von der Impurität zu scheiden weiß, der wird die Quinta Essentia nimmermehr erblicken.

Der Stein der Weisen ist nicht aus Gold gemacht, sondern aus der Erleuchtung des Geistes, wenn das Sol und Luna sich im Hermetischen Gefäß vereinen.`,
    createdAt: '2024-01-03T12:00:00.000Z',
    updatedAt: '2024-01-03T12:00:00.000Z',
  }
];
