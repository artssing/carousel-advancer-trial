// 開機自動建 admin 帳號（本地用）—— 免 setup wizard。
// 帳號：admin / admin （只限本地 CI，唔好開去公網）。
import jenkins.model.*
import hudson.security.*

def inst = Jenkins.get()

def realm = new HudsonPrivateSecurityRealm(false)
if (realm.getAllUsers().find { it.id == 'admin' } == null) {
  realm.createAccount('admin', 'admin')
  println '[init] 建咗 admin 帳號'
}
inst.setSecurityRealm(realm)

def strategy = new FullControlOnceLoggedInAuthorizationStrategy()
strategy.setAllowAnonymousRead(false)
inst.setAuthorizationStrategy(strategy)

inst.save()
