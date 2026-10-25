/// <reference path="../pb_data/types.d.ts" />

// ORTAK (core): template'ten gelir, sitede elle değiştirilmez. Kurallar lib/guard.js başında.

routerUse((e) => {
  require(`${__hooks}/lib/guard.js`).request(e)
  return e.next()
})

onRecordCreateRequest((e) => {
  require(`${__hooks}/lib/guard.js`).superusers(e, "create")
  e.next()
}, "_superusers")

onRecordUpdateRequest((e) => {
  require(`${__hooks}/lib/guard.js`).superusers(e, "update")
  e.next()
}, "_superusers")

onRecordDeleteRequest((e) => {
  require(`${__hooks}/lib/guard.js`).superusers(e, "delete")
  e.next()
}, "_superusers")
