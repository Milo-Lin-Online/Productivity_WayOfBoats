// ═══════════════════════════════════════════════════════════════
//  WAY OF BOATS — 01-config.js
//  Theme + workspace config, state shape, localStorage
//
//  Loaded in numbered order by index.html. These are classic scripts,
//  not ES modules, so every function stays global and the inline
//  onclick= handlers in the markup keep working unchanged.
// ═══════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════
//  ⚙️  CONFIG LEGEND — edit these to customize the whole site
// ══════════════════════════════════════════════════════════════════
//  Everything you can easily re-theme lives here in one place.
//
//  ── COLORS ──
//  Change any hex value to re-skin the site. (Format: '#RRGGBB')
const CONFIG = {
  colors: {
    pageBackground:   '#C5E8F7',  // the watery grid behind everything
    rightPanel:       '#1E5E63',  // the dark teal work-area panel
    sidebar:          '#DCF1FB',  // left sidebar background
    accentButton:     '#FF7A3C',  // primary button color (sunset orange)
    accentButtonDark: '#E85F22',  // button shadow / hover
    ocean:            '#3B9BD4',  // main blue used for borders/tabs
    oceanDeep:        '#2876B0',  // darker blue for titles
    sailRed:          '#E8536A'   // red accent (sails, deletes)
  },

  //  ── ICONS (emoji) ──
  //  Swap any emoji below. To use YOUR OWN IMAGE instead of an emoji,
  //  put the image URL in the matching `*Img` field and it will be used.
  //  Recommended PNG sizes (transparent background) noted per item:
  icons: {
    boatEmoji:   '⛵',  boatImg:   '',  // floating boats     — PNG 56×44 px
    fishEmoji:   '🐟',  fishImg:   '',  // swimming fish      — PNG 34×20 px
    jellyEmoji:  '🎐',  jellyImg:  '',  // jellyfish          — PNG 30×40 px
    anchorEmoji: '⚓',  anchorImg: '',  // sidebar + offline  — PNG 40×40 px
    timerEmoji:  '🎣',  timerImg:  '',  // focus-timer button — PNG 48×48 px
    trophyEmoji: '🏆',  trophyImg: '',  // leaderboard title  — PNG 40×40 px
    // Fish species you can catch (rarest last). minMinutes = focus length needed.
    fishSpecies: [
      { emoji: '🐟', name: 'Little Minnow', min: 0,  img: '' },  // PNG ~28×28 px
      { emoji: '🐠', name: 'Tropical Fish', min: 15, img: '' },
      { emoji: '🐡', name: 'Puffer Fish',   min: 25, img: '' },
      { emoji: '🦑', name: 'Squid',         min: 40, img: '' },
      { emoji: '🐙', name: 'Octopus',       min: 50, img: '' },
      { emoji: '🦞', name: 'Lobster',       min: 60, img: '' },
      { emoji: '🐋', name: 'Great Whale',   min: 90, img: '' }
    ]
  },

  //  ── LIMITS ──
  nameCharLimit: 20   // max characters for a person's name (shown as counter)
};
// Default color palette for auto-assigning new crew members' colors.
const PALETTE = ['#3B9BD4','#2876B0','#6CC4E8','#8FD0F0','#5BA8D8','#E8536A','#7AAF72','#F7E98E','#F4A460','#C9B8E8','#F7A8B5','#B5D4A8'];
// Helper: render an icon as <img> if an image URL is set, else the emoji.
function iconHTML(emoji, img, px) {
  if (img) return `<img src="${img}" style="width:${px}px;height:auto;vertical-align:middle" alt="">`;
  return emoji;
}
// Apply CONFIG colors to the CSS variables on load.
function applyConfigColors() {
  const r = document.documentElement.style;
  const c = CONFIG.colors;
  r.setProperty('--ocean', c.ocean);
  r.setProperty('--ocean-deep', c.oceanDeep);
  r.setProperty('--sail-red', c.sailRed);
  r.setProperty('--sunset', c.accentButton);
  r.setProperty('--sunset-deep', c.accentButtonDark);
  r.setProperty('--teal-panel', c.rightPanel);
  document.body.style.backgroundColor = c.pageBackground;
  const sb = document.getElementById('sidebar');
  if (sb) sb.style.background = c.sidebar;
}
// ══════════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════
// Stable key that never changes — data survives all future code updates.
const STORAGE_KEY = 'teamspace_data';
// Old versioned keys we migrate from (newest last).
const LEGACY_KEYS = ['teamspace_v9','teamspace_v10','teamspace_v11','teamspace_v12','teamspace_v13'];
let state = {
  people: [],
  meetings: [],
  tasks: [],
  myName: '',
  currentFilter: 'all',
  filterPerson: '',
  sortPriority: '',
  sortType: '',
  sortTime: '',
  sortDue: '',
  taskSearch: '',
  scoreEpoch: 0,
  selectedTemplate: 'weekly',
  templates: null, // populated below if null
  wsName: 'WAY OF BOATS',
  wsSub: 'the immortal typhoon 🌊',
  activityTypes: null,
  events: [],
  posts: [],            // social media posts for the content calendar
  messages: [],
  calView: 'month',     // 'month' | 'week'
  wcCategories: null,   // World Cup streak categories
  personTemplates: {}   // { personId: "default note text for new meetings" }
};

const DEFAULT_TEMPLATES = [
  { id: 'weekly', name: 'Weekly Sync', emoji: '📅', prompt: 'Updates · Blockers · Next steps' },
  { id: 'retro', name: 'Retro', emoji: '🔄', prompt: 'Went well · Improve · Action items' }
];

// World Cup streak categories (daily check-ins). Editable by the team.
const DEFAULT_WC_CATEGORIES = [
  { id: 'wc_move',  shape: 'triangle', color: '#FF7A3C', label: 'Move' },
  { id: 'wc_read',  shape: 'square',   color: '#3B9BD4', label: 'Read' },
  { id: 'wc_water', shape: 'circle',   color: '#6CC4E8', label: 'Hydrate' },
  { id: 'wc_deep',  shape: 'star',     color: '#7AAF72', label: 'Deep Work' }
];
