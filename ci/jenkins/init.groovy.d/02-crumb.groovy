// 本地 dev CI：關咗 CSRF crumb protection。
// 原因：n8n（同其他外部 automation）要分兩次 request（攞 crumb + POST）先過到 CSRF，
// 但 crumb 綁 session，跨 request 唔 share cookie 就會 "Forbidden / No valid crumb"。
// 呢個 Jenkins 淨係跑喺 localhost 本地，冇 cross-site 攻擊面，關 crumb 令外部觸發簡單可靠。
// 注意：登入認證（admin/admin）仍然要，只係唔再需要 crumb。上真雲端 PROD 前應該重新開返。
import jenkins.model.Jenkins

def j = Jenkins.get()
j.setCrumbIssuer(null)   // 關 CSRF crumb
j.save()
println '[init] CSRF crumb DISABLED (local dev — external triggers need auth only)'
