/// <reference path="../../pb_data/types.d.ts" />

// ORTAK (core): template'ten gelir, sitede elle değiştirilmez.
// Sunucudaki hook dosyalarının sha256'ları ve uygulanmış migration'lar. Repo ile karşılaştırılır (.github/workflows/drift.yml):
// site main'e birleşip sunucu güncellenmediyse fark çıkar. Dosya içeriği değil yalnız özet döner.

function walk(dir, prefix, out) {
  for (const entry of $os.readDir(dir)) {
    const name = entry.name()
    if (name.startsWith(".") || name === "types.d.ts") continue
    const rel = prefix ? `${prefix}/${name}` : name
    if (entry.isDir()) walk(`${dir}/${name}`, rel, out)
    else out[rel] = $security.sha256(toString($os.readFile(`${dir}/${name}`)))
  }
  return out
}

module.exports = {
  snapshot(app) {
    const rows = arrayOf(new DynamicModel({ file: "" }))
    app.db().newQuery("SELECT file FROM _migrations ORDER BY file").all(rows)
    return { hooks: walk(__hooks, "", {}), migrations: rows.map((r) => r.file) }
  },
}
