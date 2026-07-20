# Custom Jenkins image：base LTS + docker CLI + docker compose + Node 20 + git
# 令 pipeline 可以喺 Jenkins 容器內：跑 npm/turbo type-check+build、
# 經 host docker socket build image、docker compose deploy。
FROM jenkins/jenkins:lts-jdk21

USER root

# docker CLI + compose plugin（唔係 docker daemon —— 借 host 個 socket）
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl gnupg lsb-release \
 && install -m 0755 -d /etc/apt/keyrings \
 && curl -fsSL https://download.docker.com/linux/debian/gpg \
      | gpg --dearmor -o /etc/apt/keyrings/docker.gpg \
 && chmod a+r /etc/apt/keyrings/docker.gpg \
 && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
      https://download.docker.com/linux/debian $(lsb_release -cs) stable" \
      > /etc/apt/sources.list.d/docker.list \
 && apt-get update && apt-get install -y --no-install-recommends \
      docker-ce-cli docker-compose-plugin \
 && rm -rf /var/lib/apt/lists/*

# Node 20（跑 npm ci / turbo type-check / build）
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
 && apt-get install -y --no-install-recommends nodejs \
 && rm -rf /var/lib/apt/lists/*

# ── 全自動設定：免 setup wizard ──
# 1) 預裝 plugin（Pipeline 等）
COPY plugins.txt /usr/share/jenkins/ref/plugins.txt
RUN jenkins-plugin-cli -f /usr/share/jenkins/ref/plugins.txt

# 2) 關 setup wizard
ENV JAVA_OPTS="-Djenkins.install.runSetupWizard=false"

# 3) 開機自動建 admin(admin/admin) + 預載 authentik-pipeline job
#    （ref/ 內容第一次開機會 copy 入 JENKINS_HOME）
COPY init.groovy.d/ /usr/share/jenkins/ref/init.groovy.d/
COPY job-config.xml /usr/share/jenkins/ref/jobs/authentik-pipeline/config.xml

USER jenkins
