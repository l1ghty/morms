export const SAMPLE_FORTRESS_MAP = {
  id: "custom:sample_fortress",
  name: "Twin Fortresses",
  width: 1600,
  height: 900,
  version: 1,
  baseType: "island",
  additions: [
    { x: 400, y: 480, r: 90 },
    { x: 400, y: 400, r: 60 },
    { x: 1200, y: 480, r: 90 },
    { x: 1200, y: 400, r: 60 },
    { x: 800, y: 620, r: 80 }
  ],
  carves: [
    { x: 400, y: 380, r: 35 },
    { x: 1200, y: 380, r: 35 },
    { x: 800, y: 550, r: 40 }
  ]
};

const STORAGE_KEY = 'worms_custom_maps_v1';

export class CustomMapManager {
  static inMemoryMaps = {};

  static computeChecksum(mapData) {
    if (!mapData || typeof mapData !== 'object') return '000000';
    const contentStr = JSON.stringify({
      base: mapData.baseType || 'island',
      add: mapData.additions || [],
      carve: mapData.carves || [],
      plat: mapData.platforms || []
    });
    let hash = 5381;
    for (let i = 0; i < contentStr.length; i++) {
      hash = ((hash << 5) + hash) + contentStr.charCodeAt(i);
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36).substring(0, 6);
  }

  static ensureUniqueName(mapData) {
    if (!mapData || !mapData.name) return mapData;
    
    const checksum = this.computeChecksum(mapData);
    mapData.checksum = checksum;

    const existingMaps = this.getCustomMaps();
    const duplicate = existingMaps.find(m => m.name === mapData.name && m.id !== mapData.id);

    if (duplicate) {
      const suffix = ` (${checksum})`;
      if (!mapData.name.endsWith(suffix)) {
        mapData.name = `${mapData.name}${suffix}`;
      }
      
      let candidate = mapData.name;
      let counter = 2;
      while (existingMaps.some(m => m.name === candidate && m.id !== mapData.id)) {
        candidate = `${mapData.name}-${counter}`;
        counter++;
      }
      mapData.name = candidate;
    }
    return mapData;
  }

  static registerRemoteMultiplayerMap(mapData) {
    if (!mapData || typeof mapData !== 'object' || !mapData.id) return mapData;
    
    const remoteMap = JSON.parse(JSON.stringify(mapData));
    const checksum = this.computeChecksum(remoteMap);
    remoteMap.checksum = checksum;

    const existingById = this.getMapById(remoteMap.id);
    if (existingById) {
      const existingChecksum = this.computeChecksum(existingById);
      if (existingChecksum !== checksum) {
        remoteMap.id = `${remoteMap.id}_${checksum}`;
      }
    }

    this.ensureUniqueName(remoteMap);
    this.registerMap(remoteMap);
    this.saveMap(remoteMap);
    return remoteMap;
  }

  static registerMap(mapData) {
    if (mapData && typeof mapData === 'object' && mapData.id) {
      if (!mapData.id.startsWith('custom:')) {
        mapData.id = `custom:${mapData.id}`;
      }
      this.inMemoryMaps[mapData.id] = mapData;
      return mapData;
    }
    return null;
  }

  static getCustomMaps() {
    const maps = [];

    const addUnique = (candidate) => {
      if (!candidate || !candidate.id) return;
      const mapCopy = { ...candidate };
      
      // If map with same ID already exists, update it
      const existingIdx = maps.findIndex(m => m.id === mapCopy.id);
      if (existingIdx !== -1) {
        maps[existingIdx] = mapCopy;
        return;
      }

      // If another map has the exact same name, append checksum to make it unique
      let checkName = mapCopy.name || 'Custom Map';
      if (maps.some(m => m.name === checkName)) {
        const checksum = this.computeChecksum(mapCopy);
        const suffix = ` (${checksum})`;
        if (!checkName.endsWith(suffix)) {
          checkName = `${checkName}${suffix}`;
        }
        let uniqueName = checkName;
        let counter = 2;
        while (maps.some(m => m.name === uniqueName)) {
          uniqueName = `${checkName}-${counter}`;
          counter++;
        }
        mapCopy.name = uniqueName;
      }

      maps.push(mapCopy);
    };

    // 1. Add built-in template
    addUnique(SAMPLE_FORTRESS_MAP);

    // 2. Add in-memory registered maps
    Object.values(this.inMemoryMaps).forEach(m => addUnique(m));

    // 3. Add local storage maps
    if (typeof localStorage !== 'undefined') {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          const userMaps = JSON.parse(stored);
          if (Array.isArray(userMaps)) {
            userMaps.forEach(m => addUnique(m));
          }
        }
      } catch (e) {
        console.warn('Unable to access localStorage for custom maps:', e);
      }
    }
    return maps;
  }

  static getMapById(id) {
    if (typeof id === 'object' && id !== null) {
      return id;
    }
    if (this.inMemoryMaps[id]) {
      return this.inMemoryMaps[id];
    }
    const maps = this.getCustomMaps();
    return maps.find(m => m.id === id) || null;
  }

  static saveMap(mapData) {
    if (!mapData.id) {
      mapData.id = `custom:map_${Date.now()}`;
    }
    if (!mapData.id.startsWith('custom:')) {
      mapData.id = `custom:${mapData.id}`;
    }
    
    this.ensureUniqueName(mapData);
    this.registerMap(mapData);
    
    if (typeof localStorage !== 'undefined') {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        let userMaps = stored ? JSON.parse(stored) : [];
        if (!Array.isArray(userMaps)) userMaps = [];
        
        const existingIdx = userMaps.findIndex(m => m.id === mapData.id);
        if (existingIdx !== -1) {
          userMaps[existingIdx] = mapData;
        } else {
          userMaps.push(mapData);
        }
        
        localStorage.setItem(STORAGE_KEY, JSON.stringify(userMaps));
      } catch (e) {
        console.warn('Failed to save map to localStorage:', e);
      }
    }
    return mapData;
  }

  static exportMapJSON(mapData) {
    const jsonStr = JSON.stringify(mapData, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeName = (mapData.name || 'custom_map').toLowerCase().replace(/[^a-z0-9]/g, '_');
    a.download = `${safeName}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  static parseMapJSON(jsonText) {
    try {
      const data = JSON.parse(jsonText);
      if (data && typeof data === 'object') {
        if (!data.name) data.name = 'Imported Custom Map';
        if (!data.id) data.id = `custom:imp_${Date.now()}`;
        if (!data.id.startsWith('custom:')) data.id = `custom:${data.id}`;
        data.width = 1600;
        data.height = 900;
        return data;
      }
    } catch (e) {
      console.error('Invalid custom map JSON:', e);
    }
    return null;
  }

  static deleteMap(id) {
    delete this.inMemoryMaps[id];
    if (typeof localStorage !== 'undefined') {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          let userMaps = JSON.parse(stored);
          if (Array.isArray(userMaps)) {
            userMaps = userMaps.filter(m => m.id !== id);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(userMaps));
          }
        }
      } catch (e) {
        console.warn('Failed to delete map from localStorage:', e);
      }
    }
  }
}
