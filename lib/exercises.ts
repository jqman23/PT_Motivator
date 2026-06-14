export type Category = 'mobility' | 'strength';

export interface Exercise {
  id: string;
  cat: Category;
  name: string;
  cue: string;
  sets?: string;
  videoIds: string[];       // YouTube IDs — tries each in order
  videoTitles: string[];
  imageSearch: string;      // Google Images search term
  tips: string[];
  optional?: boolean;
}

export const EXERCISES: Exercise[] = [
  {
    id: 'ankle-band',
    cat: 'mobility',
    name: 'Ankle Band: Eversion & Inversion',
    cue: '2–3 sets each direction, slow and controlled',
    sets: '2–3 × 15 reps each direction',
    videoIds: ['PhJ_pMFKIFk', 'mKYZGXpgSXg', 'BkHbRjVDWLY'],
    videoTitles: ['Theraband Ankle Exercises — Bob & Brad', 'Ankle Eversion Exercise', 'Ankle Inversion & Eversion Band'],
    imageSearch: 'theraband ankle eversion inversion exercise',
    tips: [
      'Keep your heel on the ground, move only at the ankle',
      'Go slow — 2 sec out, 2 sec back',
      'Don\'t let your knee rotate — isolate the ankle',
    ],
  },
  {
    id: 'balance',
    cat: 'mobility',
    name: 'Balance on Varying Surfaces',
    cue: 'Cushion, pillow, or balance pad — both legs then single',
    sets: '3 × 30–60 sec each leg',
    videoIds: ['6dExHLLFDco', 'i5vXbdPZbNk', 'EVq8YRLA9IY'],
    videoTitles: ['Single Leg Balance Training — Prehab Guys', 'Balance Training Progressions', 'Ankle Balance Rehab'],
    imageSearch: 'single leg balance foam pad exercise physical therapy',
    tips: [
      'Start on flat ground, progress to foam/pillow',
      'Eyes open first, then try eyes closed',
      'Slight bend in the knee — don\'t lock it out',
    ],
  },
  {
    id: 'toe-yoga',
    cat: 'mobility',
    name: 'Toe Yoga',
    cue: 'Spread toes, lift big toe alone, then little toes',
    sets: '2 × 10 reps each pattern',
    videoIds: ['7A_MnPBpnaQ', 'lbDkbWGDNJo', 'wJ8-bJ1H6d8'],
    videoTitles: ['Toe Yoga for Foot Strength', 'Toe Separation Exercise', 'Foot Intrinsic Strengthening'],
    imageSearch: 'toe yoga foot exercise big toe lift',
    tips: [
      'Lift just your big toe while other toes stay flat',
      'Then reverse: press big toe down, lift the rest',
      'This takes practice — don\'t get frustrated',
    ],
  },
  {
    id: 'calf-stretch',
    cat: 'mobility',
    name: 'Calf Stretch',
    cue: 'Wall stretch, hold ~30 sec × 3 each side',
    sets: '3 × 30 sec each leg (straight + bent knee)',
    videoIds: ['IY5ZNVJ0Kca', 'R7kSdwKDQSk', 'nYCUGijMBec'],
    videoTitles: ['Calf Stretch — Bob & Brad', 'Gastrocnemius & Soleus Stretch', 'Calf Stretch Variations'],
    imageSearch: 'calf stretch wall gastrocnemius soleus physical therapy',
    tips: [
      'Do both straight-leg (gastrocnemius) and bent-knee (soleus)',
      'Push heel into the floor — don\'t let it rise',
      'Lean into the wall gradually, don\'t bounce',
    ],
  },
  {
    id: 'hip-flexor-band',
    cat: 'strength',
    name: 'Kneeling Hip Flexor Stretch (Super Band)',
    cue: 'Band around back hip, gentle lunge forward, hold',
    sets: '3 × 30–45 sec each side',
    videoIds: ['GCXAAvfx_-8', 'fsFq9FzfZ_k', 'YaXPRqUwItQ'],
    videoTitles: ['Hip Flexor Stretch with Band', 'Kneeling Hip Flexor Band Mobilization', 'Super Band Hip Flexor'],
    imageSearch: 'kneeling hip flexor stretch resistance band',
    tips: [
      'Keep your core tight and pelvis tucked under',
      'Drive the back hip forward — don\'t arch your lower back',
      'Band adds a mobilization component',
    ],
  },
  {
    id: 'single-rdl',
    cat: 'strength',
    name: 'Single-Leg RDL',
    cue: 'Focus on foot "tripod" — even pressure across the foot',
    sets: '3 × 8–10 reps each leg',
    videoIds: ['Eh00_rniF8E', 'dSoJJALFfnk', 'vq5-vdgJc0I'],
    videoTitles: ['Single Leg RDL Tutorial', 'Single Leg RDL — AthleanX', 'Romanian Deadlift Single Leg Form'],
    imageSearch: 'single leg RDL romanian deadlift form tutorial',
    tips: [
      'Three contact points: big toe mound, pinky toe mound, heel',
      'Hinge at the hip — push your butt back, not down',
      'Keep a soft knee on the standing leg',
    ],
  },
  {
    id: 'hip-thrust',
    cat: 'strength',
    name: 'Single-Leg Hip Thrust (Bench)',
    cue: 'Shoulders on bench, drive through one heel',
    sets: '3 × 10–12 reps each leg',
    videoIds: ['cPhMGnSpJDk', 'qKnFiWzJqKo', 'LM8XfHGHCMQ'],
    videoTitles: ['Single Leg Hip Thrust — Glute Lab', 'Hip Thrust Single Leg Tutorial', 'Single Leg Hip Thrust Form'],
    imageSearch: 'single leg hip thrust bench glute exercise form',
    tips: [
      'Chin tucked — don\'t hyperextend your neck looking up',
      'Drive through your heel, not your toes',
      'Squeeze glute at the top, hold 1 sec',
    ],
  },
  {
    id: 'leg-strength',
    cat: 'strength',
    name: 'General Leg Strengthening',
    cue: 'Squat, lunge, or deadlift — pick 1–2 movements',
    sets: '3 × 8–12 reps',
    videoIds: ['MeIiIdhvXT4', 'U3HlEF_E9fo', 'YaXPRqUwItQ'],
    videoTitles: ['Goblet Squat — Alan Thrall', 'How to Squat', 'Split Squat Tutorial'],
    imageSearch: 'goblet squat lunge leg exercise form physical therapy',
    tips: [
      'Prioritize form over weight — especially ankle recovery',
      'Goblet squat is great for bilateral loading',
      'Bulgarian split squat builds single-leg strength',
    ],
  },
  {
    id: 'glute-bridge',
    cat: 'strength',
    name: 'Single-Leg Glute Bridge',
    cue: 'Lying down, lift hips, one leg extended',
    sets: '3 × 10–15 reps each leg',
    videoIds: ['BnE0CDMiAhI', 'wPM8icPu6H8', 'mvJsStxX2oE'],
    videoTitles: ['Single Leg Glute Bridge — Bret Contreras', 'Single Leg Hip Bridge Tutorial', 'Glute Bridge Progression'],
    imageSearch: 'single leg glute bridge exercise form lying down',
    tips: [
      'Extend one leg straight out, drive through planted heel',
      'Don\'t let your hips rotate — keep them square',
      'Pause at the top to increase glute activation',
    ],
  },
  {
    id: 'hip-circuit',
    cat: 'strength',
    name: 'Hip Circuit: March, Side Kick, Glute Extension',
    cue: 'Optional — standing on one leg, band around ankles',
    sets: '2 × 12 reps each movement',
    videoIds: ['qO89m12s4K8', '0zOa9tCiZ1I', 'DqRqIGnCnQo'],
    videoTitles: ['Hip Band Circuit Standing', 'Standing Hip Circuit with Band', 'Hip Abduction Band Exercises'],
    imageSearch: 'standing hip circuit resistance band exercises glute',
    tips: [
      'Stay tall — don\'t lean to compensate',
      'Control the movement both ways',
      'Glute extension goes diagonally back',
    ],
    optional: true,
  },
  {
    id: 'cable-hip-flexor',
    cat: 'strength',
    name: 'Cable Hip Flexor Stretch / Strengthen',
    cue: 'Optional — hook leg on cable, seated on a block',
    sets: '3 × 10–12 reps each leg',
    videoIds: ['YQmpO-tNFaA', 'FN5aFfGBZIA', 'tEpzOUkGkfk'],
    videoTitles: ['Cable Hip Flexor Exercise', 'Hip Flexor Cable Machine', 'Hip Flexor Strength Cable'],
    imageSearch: 'cable machine hip flexor exercise seated block',
    tips: [
      'Sit tall on the block — don\'t slouch',
      'Focus on the full range: extension → flexion',
      'Light weight first to learn the movement',
    ],
    optional: true,
  },
];
