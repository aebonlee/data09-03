/* 브라우저 저장소 — localStorage 를 쓰되, 막혀 있으면 메모리로만 동작합니다 */
(function (root) {
  'use strict';
  var KEY_DB = 'data09-03.db';
  var memory = {};
  var ok = true;
  function get(k) {
    try { return root.localStorage.getItem(k); } catch (e) { ok = false; return memory[k] == null ? null : memory[k]; }
  }
  function set(k, v) {
    try { root.localStorage.setItem(k, v); return true; } catch (e) {
      // 막혀 있거나 용량(보통 5MB)을 넘으면 메모리에만 둡니다
      ok = false; memory[k] = v; return false;
    }
  }
  function del(k) {
    try { root.localStorage.removeItem(k); } catch (e) { ok = false; delete memory[k]; }
  }
  function loadDb() {
    var db = root.DLLogic.emptyDb();
    var raw = get(KEY_DB);
    if (!raw) return db;
    try {
      var p = JSON.parse(raw);
      if (Array.isArray(p.rows)) db.rows = p.rows;
      if (p.prices && typeof p.prices === 'object') db.prices = p.prices;
      if (p.mapping && typeof p.mapping === 'object') db.mapping = p.mapping;
      if (typeof p.seq === 'number') db.seq = p.seq;
      if (p.masters && typeof p.masters === 'object') db.masters = p.masters;
      if (p.settings && typeof p.settings === 'object') db.settings = p.settings;
      if (p._sample) db._sample = true;
    } catch (e) { /* 깨진 값은 무시하고 빈 DB */ }
    return db;
  }
  root.DLStore = {
    loadDb: loadDb,
    saveDb: function (db) { return set(KEY_DB, JSON.stringify(db)); },
    clearDb: function () { del(KEY_DB); },
    available: function () { get(KEY_DB); return ok; }
  };
})(window);
