// Szenen im Browser speichern (IndexedDB).
// Zwei Ablagen: "meta" (klein: Zeit, Dauer, Vorschaubild) und "data" (das Video selbst).
// So muss beim Start nicht jedes Video in den Arbeitsspeicher geladen werden.

const DB = 'trainingskamera';
let dbp;

function db() {
  dbp ??= new Promise((res, rej) => {
    const r = indexedDB.open(DB, 2);
    r.onupgradeneeded = e => {
      const d = r.result;
      d.createObjectStore('meta', { keyPath: 'id' });
      d.createObjectStore('data');
      if (e.oldVersion === 1) {
        // Szenen aus der ersten Version übernehmen
        const t = r.transaction;
        t.objectStore('clips').openCursor().onsuccess = ev => {
          const cur = ev.target.result;
          if (!cur) { d.deleteObjectStore('clips'); return; }
          const { blob, ...meta } = cur.value;
          t.objectStore('meta').put(meta);
          if (blob) t.objectStore('data').put(blob, meta.id);
          cur.continue();
        };
      }
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbp;
}

async function tx(stores, mode, fn) {
  const d = await db();
  return new Promise((res, rej) => {
    const t = d.transaction(stores, mode);
    const out = fn(...stores.map(s => t.objectStore(s)));
    t.oncomplete = () => res(out?.result ?? out);
    t.onerror = t.onabort = () => rej(t.error);
  });
}

// meta: {id, createdAt, duration, fps, width, height, starred, source, profile, thumb: ArrayBuffer}
export const putClip = (meta, data) => tx(['meta', 'data'], 'readwrite', (m, d) => { m.put(meta); if (data) d.put(data, meta.id); });
export const deleteClip = id => tx(['meta', 'data'], 'readwrite', (m, d) => { m.delete(id); d.delete(id); });
export const getClipData = id => tx(['data'], 'readonly', d => d.get(id));
export const allClips = async () => {
  const list = await tx(['meta'], 'readonly', m => m.getAll());
  return list.sort((a, b) => b.createdAt - a.createdAt);
};

// Älteste Szenen ohne Stern löschen, wenn mehr als max vorhanden
export async function prune(max) {
  const old = (await allClips()).filter(c => !c.starred).slice(max);
  for (const c of old) await deleteClip(c.id);
  return old.map(c => c.id);
}
