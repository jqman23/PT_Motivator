export type Category = 'mobility' | 'strength';

export interface Exercise {
  id: string;
  cat: Category;
  name: string;
  cue: string;
  sets?: string;
  videoUrl?: string;
  videoTitle?: string;
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
    videoUrl: 'https://www.youtube.com/watch?v=PhJ_pMFKIFk',
    videoTitle: 'Theraband Ankle Eversion & Inversion — Bob & Brad',
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
    videoUrl: 'https://www.youtube.com/watch?v=6dExHLLFDco',
    videoTitle: 'Single Leg Balance Training — Prehab Guys',
    tips: [
      'Start on flat ground, progress to foam/pillow',
      'Eyes open first, then try eyes closed for a challenge',
      'Slight bend in the knee — don\'t lock it out',
    ],
  },
  {
    id: 'toe-yoga',
    cat: 'mobility',
    name: 'Toe Yoga',
    cue: 'Spread toes, lift big toe alone, then little toes',
    sets: '2 × 10 reps each pattern',
    videoUrl: 'https://www.youtube.com/watch?v=7A_MnPBpnaQ',
    videoTitle: 'Toe Yoga — Foot & Ankle Mobility',
    tips: [
      'Try to lift just your big toe while other toes stay down',
      'Then reverse: press big toe down, lift the others',
      'This takes practice — don\'t get frustrated',
    ],
  },
  {
    id: 'calf-stretch',
    cat: 'mobility',
    name: 'Calf Stretch',
    cue: 'Wall stretch, hold ~30 sec × 3 each side',
    sets: '3 × 30 sec each leg (straight + bent knee)',
    videoUrl: 'https://www.youtube.com/watch?v=IY5ZNVJ0Kca',
    videoTitle: 'Calf Stretch — Bob & Brad',
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
    videoUrl: 'https://www.youtube.com/watch?v=GCXAAvfx_-8',
    videoTitle: 'Kneeling Hip Flexor Stretch with Band',
    tips: [
      'Keep your core tight and pelvis tucked under',
      'Drive the back hip forward — don\'t arch your lower back',
      'Band adds a mobilization component — let it do its job',
    ],
  },
  {
    id: 'single-rdl',
    cat: 'strength',
    name: 'Single-Leg RDL',
    cue: 'Focus on foot "tripod" — even pressure across the foot',
    sets: '3 × 8–10 reps each leg',
    videoUrl: 'https://www.youtube.com/watch?v=Eh00_rniF8E',
    videoTitle: 'Single Leg RDL — How To',
    tips: [
      'Feel three points of contact: big toe mound, pinky toe mound, heel',
      'Hinge at the hip — push your butt back, not down',
      'Keep a soft knee on the standing leg',
      'The floating leg doesn\'t need to go super high — control matters more',
    ],
  },
  {
    id: 'hip-thrust',
    cat: 'strength',
    name: 'Single-Leg Hip Thrust (Bench)',
    cue: 'Shoulders on bench, drive through one heel',
    sets: '3 × 10–12 reps each leg',
    videoUrl: 'https://www.youtube.com/watch?v=cPhMGnSpJDk',
    videoTitle: 'Single Leg Hip Thrust — Glute Lab',
    tips: [
      'Chin tucked — don\'t hyperextend your neck looking up',
      'Drive through your heel, not your toes',
      'Squeeze glute at the top, hold 1 sec',
      'Keep your hips level — don\'t let the non-working side drop',
    ],
  },
  {
    id: 'leg-strength',
    cat: 'strength',
    name: 'General Leg Strengthening',
    cue: 'Squat, lunge, or deadlift — pick 1–2 movements',
    sets: '3 × 8–12 reps',
    videoUrl: 'https://www.youtube.com/watch?v=MeIiIdhvXT4',
    videoTitle: 'Goblet Squat — Alan Thrall',
    tips: [
      'Prioritize form over weight — especially with an ankle recovery',
      'Goblet squat is great if bilateral loading feels okay',
      'Bulgarian split squat challenges balance and builds single-leg strength',
    ],
  },
  {
    id: 'glute-bridge',
    cat: 'strength',
    name: 'Single-Leg Glute Bridge',
    cue: 'Lying down, lift hips, one leg extended',
    sets: '3 × 10–15 reps each leg',
    videoUrl: 'https://www.youtube.com/watch?v=BnE0CDMiAhI',
    videoTitle: 'Single Leg Glute Bridge — Bret Contreras',
    tips: [
      'Extend one leg straight out, drive through the planted heel',
      'Don\'t let your hips rotate — keep them square',
      'Add a pause at the top to increase glute activation',
    ],
  },
  {
    id: 'hip-circuit',
    cat: 'strength',
    name: 'Hip Circuit: March, Side Kick, Glute Extension',
    cue: 'Optional — standing on one leg, band around ankles',
    sets: '2 × 12 reps each movement',
    videoUrl: 'https://www.youtube.com/watch?v=qO89m12s4K8',
    videoTitle: 'Hip Band Circuit — Standing',
    tips: [
      'Stay tall — don\'t lean to compensate for the kicking leg',
      'Control the movement both ways (concentric and eccentric)',
      'Glute extension goes diagonally back — not straight back',
    ],
    optional: true,
  },
  {
    id: 'cable-hip-flexor',
    cat: 'strength',
    name: 'Cable Hip Flexor Stretch / Strengthen',
    cue: 'Optional — hook leg on cable, seated on a block',
    sets: '3 × 10–12 reps each leg',
    videoUrl: 'https://www.youtube.com/watch?v=YQmpO-tNFaA',
    videoTitle: 'Cable Hip Flexor Stretch & Strengthen',
    tips: [
      'Sit tall on the block — don\'t slouch',
      'Focus on the full range: extension → flexion',
      'Light weight first to learn the movement',
    ],
    optional: true,
  },
];
