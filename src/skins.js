// Ball skins. Each skin describes the ball material; `special` skins get extra
// animated treatment in the renderer (e.g. hue-cycling).
export const SKINS = [
  {
    id: 'classic',
    name: 'Classic',
    price: 0,
    color: 0xffffff,
    emissive: 0x2bd4ff,
    emissiveIntensity: 0.4,
    metalness: 0.6,
    roughness: 0.18,
    ring: 0xff3b81,
  },
  {
    id: 'magma',
    name: 'Magma',
    price: 60,
    color: 0xff6a2b,
    emissive: 0xff2200,
    emissiveIntensity: 0.9,
    metalness: 0.5,
    roughness: 0.35,
    ring: 0xffd000,
  },
  {
    id: 'emerald',
    name: 'Emerald',
    price: 80,
    color: 0x21e6a4,
    emissive: 0x00b070,
    emissiveIntensity: 0.7,
    metalness: 0.7,
    roughness: 0.15,
    ring: 0xeaffee,
  },
  {
    id: 'amethyst',
    name: 'Amethyst',
    price: 120,
    color: 0xb46bff,
    emissive: 0x7a1fff,
    emissiveIntensity: 0.85,
    metalness: 0.75,
    roughness: 0.2,
    ring: 0xffffff,
  },
  {
    id: 'gold',
    name: 'Solid Gold',
    price: 250,
    color: 0xffd54a,
    emissive: 0x4a3500,
    emissiveIntensity: 0.5,
    metalness: 0.98,
    roughness: 0.08,
    ring: 0xfff3b0,
  },
  {
    id: 'chrome',
    name: 'Chrome',
    price: 200,
    color: 0xdfe8ff,
    emissive: 0x223044,
    emissiveIntensity: 0.3,
    metalness: 1.0,
    roughness: 0.04,
    ring: 0x9fd8ff,
  },
  {
    id: 'shadow',
    name: 'Void',
    price: 180,
    color: 0x10131f,
    emissive: 0x6a00ff,
    emissiveIntensity: 1.0,
    metalness: 0.6,
    roughness: 0.25,
    ring: 0x9a4bff,
  },
  {
    id: 'plasma',
    name: 'Plasma',
    price: 400,
    color: 0xffffff,
    emissive: 0xffffff,
    emissiveIntensity: 1.1,
    metalness: 0.4,
    roughness: 0.2,
    ring: 0xffffff,
    special: 'rainbow', // hue-cycles every frame
  },
];

export const DEFAULT_SKIN = 'classic';

const OWNED_KEY = 'ibr_owned_skins';
const EQUIP_KEY = 'ibr_equipped_skin';

export class SkinStore {
  constructor() {
    this.owned = this._loadOwned();
    if (!this.owned.includes(DEFAULT_SKIN)) this.owned.push(DEFAULT_SKIN);
    this.equipped = localStorage.getItem(EQUIP_KEY) || DEFAULT_SKIN;
    if (!this.owned.includes(this.equipped)) this.equipped = DEFAULT_SKIN;
  }

  _loadOwned() {
    try {
      const a = JSON.parse(localStorage.getItem(OWNED_KEY) || '[]');
      return Array.isArray(a) ? a : [];
    } catch {
      return [];
    }
  }

  _saveOwned() {
    try {
      localStorage.setItem(OWNED_KEY, JSON.stringify(this.owned));
    } catch {
      /* ignore */
    }
  }

  isOwned(id) {
    return this.owned.includes(id);
  }

  unlock(id) {
    if (!this.owned.includes(id)) {
      this.owned.push(id);
      this._saveOwned();
    }
  }

  equip(id) {
    if (!this.owned.includes(id)) return false;
    this.equipped = id;
    try {
      localStorage.setItem(EQUIP_KEY, id);
    } catch {
      /* ignore */
    }
    return true;
  }

  get equippedSkin() {
    return SKINS.find((s) => s.id === this.equipped) || SKINS[0];
  }
}
