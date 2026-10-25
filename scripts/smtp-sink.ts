// ORTAK (core): template'ten gelir, sitede elle değiştirilmez (bun run core:sync).
type State = { buf: string; inData: boolean; msg: string }

/** Test için minimal SMTP alıcısı: gelen mesajları ham metin olarak toplar. */
export function startSmtpSink() {
  const messages: string[] = []
  const server = Bun.listen<State>({
    hostname: "127.0.0.1",
    port: 0,
    socket: {
      open(s) {
        s.data = { buf: "", inData: false, msg: "" }
        s.write("220 sink ESMTP\r\n")
      },
      data(s, chunk) {
        const st = s.data
        st.buf += chunk.toString()
        let i: number
        while ((i = st.buf.indexOf("\r\n")) >= 0) {
          const line = st.buf.slice(0, i)
          st.buf = st.buf.slice(i + 2)
          if (st.inData) {
            if (line === ".") {
              st.inData = false
              messages.push(st.msg)
              st.msg = ""
              s.write("250 ok\r\n")
            } else {
              st.msg += (line.startsWith("..") ? line.slice(1) : line) + "\r\n"
            }
            continue
          }
          const cmd = line.slice(0, 4).toUpperCase()
          if (cmd === "EHLO" || cmd === "HELO") s.write("250 sink\r\n")
          else if (cmd === "DATA") {
            st.inData = true
            s.write("354 go\r\n")
          } else if (cmd === "QUIT") {
            s.write("221 bye\r\n")
            s.end()
          } else s.write("250 ok\r\n")
        }
      },
    },
  })
  return { port: server.port, messages, stop: () => server.stop(true) }
}

/** Ham SMTP iletisinin HTML gövdesi (quoted-printable ya da base64 çözülmüş). */
export function htmlPart(raw: string): string {
  // MIME parçaları: başlıklar boş satıra kadar, gövde sonraki sınır satırına kadar
  for (const part of raw.split(/\r\n--[^\r\n]+/)) {
    const at = part.indexOf("\r\n\r\n")
    if (at < 0) continue
    const head = part.slice(0, at)
    if (!/^Content-Type: text\/html/im.test(head)) continue
    const body = part.slice(at + 4)
    if (/^Content-Transfer-Encoding: base64/im.test(head)) return Buffer.from(body.replace(/\s+/g, ""), "base64").toString("utf8")
    if (/^Content-Transfer-Encoding: quoted-printable/im.test(head)) {
      const bytes = body.replace(/=\r\n/g, "").replace(/=([0-9A-F]{2})/gi, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
      return Buffer.from(bytes, "latin1").toString("utf8")
    }
    return body
  }
  return ""
}

/** Ham SMTP iletisinin (RFC 2047 kodlu olabilen) konu satırı. */
export function subject(raw: string): string {
  const m = /^Subject: (.*(?:\r\n[ \t].*)*)/m.exec(raw)
  if (!m) return ""
  return m[1]!.replace(/\r\n[ \t]/g, "").replace(/=\?utf-8\?([bq])\?([^?]*)\?=\s*/gi, (_, enc: string, text: string) =>
    enc.toLowerCase() === "b"
      ? Buffer.from(text, "base64").toString("utf8")
      : Buffer.from(text.replace(/_/g, " ").replace(/=([0-9A-F]{2})/gi, (_x, h: string) => String.fromCharCode(parseInt(h, 16))), "latin1").toString("utf8"))
}
