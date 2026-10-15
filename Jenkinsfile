// =============================================================================
// CI/CD for the standalone MDS (OpenG2P Master Data Service).
//
// Branch -> environment on the MDS-dev-staging server (single-node RKE2):
//   develop  -> namespace "develop"  https://mds-dev.oanstaging.com      (automatic)
//   staging  -> namespace "staging"  https://mds-staging.mda.test        (after approval)
//   anything else (main, feature branches, PRs) -> lint only, nothing is built or deployed
//
// A deploy:
//   1. lints the Python/JS files and docker-compose.yml
//   2. builds and PUSHES to Amazon ECR (<registry>/mds/<name>:<env>-<commit>-b<build>):
//        master-data-ui       official UI image + this repo's customize_sidebar.js (docker/ui.Dockerfile)
//        master-data-api      official API image, re-published unchanged (docker/mirror.Dockerfile)
//        master-data-db-seed  official seed image, re-published unchanged
//   3. refreshes the "ecr-pull" secret on the cluster so it can PULL from ECR
//      (ci/ecr-pull-secret.sh; ECR tokens last 12h, so a timer refreshes it every 6h too)
//   4. backs up, ships the catalog scripts + data/, and runs the Ansible playbooks on
//      the server with the ECR image references: 03-deploy-mds.yml -> verify.yml,
//      then an HTTPS smoke test
//
// docker_proxy.py / docker_proxy.js are local-only (compose) and are not shipped.
//
// Jenkins setup:
//   - Multibranch Pipeline job on this repository
//   - Credential "mds-dev-staging-ssh" (SSH Username with private key), user "ubuntu"
//   - Credential "aws-mds-ecr" (Username with password): username = AWS access key id,
//     password = secret access key. Needs ecr:GetAuthorizationToken, the push/pull
//     actions on repositories "mds/*", plus ecr:CreateRepository / PutLifecyclePolicy
//     for the first run. Leave AWS_CREDENTIALS empty to use the agent's own IAM role.
//   - Linux agent with docker, aws CLI v2, ssh, tar, curl, python3 (node optional)
//   - The server's security group must allow SSH (22) from the Jenkins agent
// =============================================================================

// No "def": script bindings, so they are visible inside the declarative stages.
BRANCH_ENV = [develop: 'develop', staging: 'staging']
HOSTS = [
    develop: [ui: 'mds-dev.oanstaging.com', api: 'mds-api-dev.oanstaging.com'],
    staging: [ui: 'mds-staging.mda.test',   api: 'mds-api-staging.mda.test'],
]

def targetEnv() {
    return BRANCH_ENV[env.BRANCH_NAME]
}

def isTimer() {
    return !currentBuild.getBuildCauses('hudson.triggers.TimerTrigger$TimerTriggerCause').isEmpty()
}

// lint | refresh (timer: only renew the ECR pull secret) | deploy | verify | backup | rollback
def mode() {
    if (!targetEnv()) { return 'lint' }
    if (isTimer())    { return 'refresh' }
    return params.ACTION
}

def withAws(Closure body) {
    if (env.AWS_CREDENTIALS) {
        withCredentials([usernamePassword(credentialsId: env.AWS_CREDENTIALS,
                                          usernameVariable: 'AWS_ACCESS_KEY_ID',
                                          passwordVariable: 'AWS_SECRET_ACCESS_KEY')]) { body() }
    } else {
        body()
    }
}

def withSsh(Closure body) {
    withCredentials([sshUserPrivateKey(credentialsId: env.SSH_CREDENTIALS,
                                       keyFileVariable: 'SSH_KEY', usernameVariable: 'SSH_USER')]) { body() }
}

// Sets env.ECR_REGISTRY from the AWS account of the credentials in use.
def resolveRegistry() {
    if (!env.ECR_REGISTRY) {
        def account = sh(returnStdout: true,
                         script: 'aws sts get-caller-identity --query Account --output text').trim()
        env.ECR_REGISTRY = "${account}.dkr.ecr.${env.AWS_REGION}.amazonaws.com"
    }
}

// Runs a bash script on the server inside the Ansible venv, from ~/MDS-service/ansible.
def onServer(String script) {
    writeFile file: '.remote.sh', text: """set -euo pipefail
source ~/.venvs/ansible/bin/activate
cd ~/MDS-service/ansible
export KUBECONFIG=~/.kube/config PATH=\$PATH:/var/lib/rancher/rke2/bin
V="--vault-password-file \$HOME/.mds_vault_pass"
${script}
"""
    withSsh {
        sh 'ssh -i "$SSH_KEY" $SSH_OPTS "$SSH_USER@$MDS_HOST" "bash -s" < .remote.sh'
    }
}

// Gives the namespace a fresh ECR pull secret. The token goes over ssh stdin only.
def refreshPullSecret(String ns) {
    withAws {
        resolveRegistry()
        withSsh {
            withEnv(["NS=${ns}"]) {
                sh '''
                    tr -d '\\r' < ci/ecr-pull-secret.sh \
                      | ssh -i "$SSH_KEY" $SSH_OPTS "$SSH_USER@$MDS_HOST" 'cat > ~/.mds-ecr-pull-secret.sh && chmod 700 ~/.mds-ecr-pull-secret.sh'
                    aws ecr get-login-password --region "$AWS_REGION" \
                      | ssh -i "$SSH_KEY" $SSH_OPTS "$SSH_USER@$MDS_HOST" "bash ~/.mds-ecr-pull-secret.sh $ECR_REGISTRY $NS"
                '''
            }
        }
    }
}

// Waits until the API /ping and the UI /en answer through the ingress.
// --resolve pins the names to the server, so staging (*.mda.test) works without DNS.
def smokeTest(Map hosts) {
    sh """
        for url in https://${hosts.api}/ping https://${hosts.ui}/en; do
          host=\$(echo "\$url" | cut -d/ -f3)
          for i in \$(seq 1 20); do
            code=\$(curl -sk -o /dev/null -w '%{http_code}' --max-time 10 \
                     --resolve "\$host:443:\$MDS_IP" "\$url" || true)
            case "\$code" in 200|302|307|308) echo "OK  \$url -> \$code"; continue 2 ;; esac
            echo "... \$url -> \$code (attempt \$i/20)"; sleep 15
          done
          echo "FAIL \$url"; exit 1
        done
    """
}

pipeline {
    agent any

    options {
        disableConcurrentBuilds()          // one 2-vCPU node, one Ansible run at a time
        buildDiscarder(logRotator(numToKeepStr: '30'))
        timeout(time: 90, unit: 'MINUTES')
    }

    // The org repo has no Jenkins webhook, so the deploy branches poll for new commits.
    // The timer only renews the ECR pull secret (tokens expire after 12h).
    triggers {
        pollSCM(env.BRANCH_NAME in ['develop', 'staging'] ? 'H/5 * * * *' : '')
        cron(env.BRANCH_NAME in ['develop', 'staging'] ? 'H */6 * * *' : '')
    }

    parameters {
        choice(name: 'ACTION', choices: ['deploy', 'verify', 'backup', 'rollback'],
               description: '''Only on the develop / staging branches (a push always runs "deploy").
deploy   = lint, build + push images to ECR, backup, deploy from ECR, verify, smoke test
verify   = verify.yml + smoke test
backup   = backup.yml (in-cluster job + pg_dump kept on the server, newest 5)
rollback = kubectl rollout undo of mds-api and mds-ui''')
        string(name: 'UPSTREAM_API', defaultValue: 'openg2p/master-data-api:develop', trim: true,
               description: 'deploy: official API image to re-publish in ECR')
        string(name: 'UPSTREAM_UI', defaultValue: 'openg2p/master-data-ui:develop', trim: true,
               description: 'deploy: official UI image the sidebar is applied to')
        string(name: 'UPSTREAM_SEED', defaultValue: 'openg2p/master-data-db-seed:develop', trim: true,
               description: 'deploy: official seed (country-pack loader) image to re-publish in ECR')
        booleanParam(name: 'BACKUP_BEFORE_DEPLOY', defaultValue: true,
                     description: 'deploy: run backup.yml first')
        booleanParam(name: 'SEED_AFTER_DEPLOY', defaultValue: false,
                     description: 'deploy: run 04-seed-catalogs (official ETH pack; unchanged lists are skipped, changed ones become DRAFTs)')
    }

    environment {
        MDS_HOST        = 'ec2-13-233-134-2.ap-south-1.compute.amazonaws.com'
        MDS_IP          = '13.233.134.2'
        SSH_CREDENTIALS = 'mds-dev-staging-ssh'
        SSH_OPTS        = '-o StrictHostKeyChecking=accept-new -o BatchMode=yes -o ServerAliveInterval=30'
        AWS_REGION      = 'ap-south-1'
        AWS_CREDENTIALS = 'aws-mds-ecr'
        ECR_PREFIX      = 'mds'
    }

    stages {
        stage('Lint') {
            when { expression { mode() in ['lint', 'deploy'] } }
            steps {
                script {
                    [params.UPSTREAM_API, params.UPSTREAM_UI, params.UPSTREAM_SEED].each { img ->
                        if (!(img ==~ /^[A-Za-z0-9._\/:@-]+$/)) {
                            error "Invalid image reference: '${img}'"
                        }
                    }
                    currentBuild.description = mode() == 'lint' ? 'lint only' : "${mode()} -> ${targetEnv()}"
                }
                sh '''
                    set -e
                    python3 -m py_compile *.py && echo "python: OK"
                    bash -n ci/ecr-pull-secret.sh && echo "ci script: OK"
                    if command -v node >/dev/null 2>&1; then
                      for f in *.js; do node --check "$f"; done && echo "node: OK"
                    else
                      echo "node not available on this agent, skipping JS check"
                    fi
                    if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
                      docker compose -f docker-compose.yml config -q && echo "compose: OK"
                    else
                      echo "docker compose not available on this agent, skipping compose check"
                    fi
                '''
            }
        }

        stage('Build & push to ECR') {
            when { expression { mode() == 'deploy' } }
            steps {
                script {
                    env.IMAGE_TAG = "${targetEnv()}-${env.GIT_COMMIT.take(8)}-b${env.BUILD_NUMBER}"
                    currentBuild.description = "deploy -> ${targetEnv()} (${env.IMAGE_TAG})"
                }
                withAws {
                    script { resolveRegistry() }
                    withEnv(["TARGET=${targetEnv()}", "UPSTREAM_API=${params.UPSTREAM_API}",
                             "UPSTREAM_UI=${params.UPSTREAM_UI}", "UPSTREAM_SEED=${params.UPSTREAM_SEED}"]) {
                        sh '''
                            set -eu
                            # Private docker config: the ECR login never touches the agent's ~/.docker.
                            export DOCKER_CONFIG="$WORKSPACE/.docker-ecr"
                            mkdir -p "$DOCKER_CONFIG"
                            aws ecr get-login-password --region "$AWS_REGION" \
                              | docker login --username AWS --password-stdin "$ECR_REGISTRY"

                            for repo in master-data-api master-data-ui master-data-db-seed; do
                              if ! aws ecr describe-repositories --region "$AWS_REGION" \
                                     --repository-names "$ECR_PREFIX/$repo" >/dev/null 2>&1; then
                                aws ecr create-repository --region "$AWS_REGION" --repository-name "$ECR_PREFIX/$repo" \
                                  --image-scanning-configuration scanOnPush=true >/dev/null
                                aws ecr put-lifecycle-policy --region "$AWS_REGION" --repository-name "$ECR_PREFIX/$repo" \
                                  --lifecycle-policy-text '{"rules":[{"rulePriority":1,"description":"keep the newest 30 images","selection":{"tagStatus":"any","countType":"imageCountMoreThan","countNumber":30},"action":{"type":"expire"}}]}' >/dev/null
                                echo "created ECR repository $ECR_PREFIX/$repo"
                              fi
                            done

                            # build <repo> <dockerfile> <upstream image>
                            build() {
                              ref="$ECR_REGISTRY/$ECR_PREFIX/$1"
                              docker build --pull -f "$2" --build-arg BASE_IMAGE="$3" \
                                --label org.opencontainers.image.source="$GIT_URL" \
                                --label org.opencontainers.image.revision="$GIT_COMMIT" \
                                --label org.opencontainers.image.base.name="$3" \
                                -t "$ref:$IMAGE_TAG" -t "$ref:$TARGET-latest" .
                              docker push "$ref:$IMAGE_TAG"
                              docker push "$ref:$TARGET-latest"
                              docker rmi "$ref:$IMAGE_TAG" "$ref:$TARGET-latest" >/dev/null || true
                            }
                            build master-data-api     docker/mirror.Dockerfile "$UPSTREAM_API"
                            build master-data-ui      docker/ui.Dockerfile     "$UPSTREAM_UI"
                            build master-data-db-seed docker/mirror.Dockerfile "$UPSTREAM_SEED"

                            docker logout "$ECR_REGISTRY" >/dev/null
                            rm -rf "$DOCKER_CONFIG"
                        '''
                    }
                }
            }
        }

        stage('Approve staging') {
            when { expression { targetEnv() == 'staging' && mode() in ['deploy', 'rollback'] } }
            steps {
                timeout(time: 60, unit: 'MINUTES') {
                    input message: "Run '${mode()}' on staging (${env.IMAGE_TAG ?: env.GIT_COMMIT?.take(8)})?",
                          ok: "Yes, ${mode()} staging"
                }
            }
        }

        stage('Refresh ECR pull secret') {
            when { expression { mode() in ['deploy', 'rollback', 'refresh'] } }
            steps {
                refreshPullSecret(targetEnv())
            }
        }

        stage('Backup') {
            when { expression { mode() == 'backup' || (mode() == 'deploy' && params.BACKUP_BEFORE_DEPLOY) } }
            steps {
                onServer("""
ansible-playbook playbooks/backup.yml -e mds_env=${targetEnv()} \$V
ls -1t artifacts/backups/${targetEnv()}/*.dump 2>/dev/null | tail -n +6 | xargs -r rm -f
""")
            }
        }

        stage('Ship catalog files') {
            when { expression { mode() == 'deploy' } }
            steps {
                // Scripts + data go to catalog-scripts/ for manual imports; nothing runs them.
                // The sidebar is baked into the UI image, so it is not shipped as a hook.
                withSsh {
                    sh '''
                        tar -czf - import_all_catalogs.py import_input_catalog.py add_geography_to_catalogs.py \
                                   sync_catalog_data.py parse_sql.py data \
                        | ssh -i "$SSH_KEY" $SSH_OPTS "$SSH_USER@$MDS_HOST" '
                            set -e
                            A=~/MDS-service/ansible/files/catalog-scripts
                            mkdir -p "$A"
                            tar -xzf - -C "$A"
                            find "$A" -type f \\( -name "*.py" -o -name "*.sql" \\) -exec sed -i "s/\\r$//" {} +'
                    '''
                }
            }
        }

        stage('Deploy') {
            when { expression { mode() == 'deploy' } }
            steps {
                script {
                    def repo = "${env.ECR_REGISTRY}/${env.ECR_PREFIX}"
                    def images = " -e mds_api_image=${repo}/master-data-api:${env.IMAGE_TAG}" +
                                 " -e mds_ui_image=${repo}/master-data-ui:${env.IMAGE_TAG}" +
                                 " -e mds_seed_image=${repo}/master-data-db-seed:${env.IMAGE_TAG}" +
                                 " -e mds_image_pull_policy=IfNotPresent"    // tags are unique per build
                    onServer("ansible-playbook playbooks/03-deploy-mds.yml -e mds_env=${targetEnv()}${images} \$V")
                    if (params.SEED_AFTER_DEPLOY) {
                        onServer("ansible-playbook playbooks/04-seed-catalogs.yml -e mds_env=${targetEnv()}${images} \$V")
                    }
                }
            }
        }

        stage('Rollback') {
            when { expression { mode() == 'rollback' } }
            steps {
                onServer("""
kubectl -n ${targetEnv()} rollout undo deploy/mds-api
kubectl -n ${targetEnv()} rollout undo deploy/mds-ui
kubectl -n ${targetEnv()} rollout status deploy/mds-api --timeout=10m
kubectl -n ${targetEnv()} rollout status deploy/mds-ui  --timeout=10m
""")
                echo "Rolled back ${targetEnv()} to the previous ECR image. The next deploy rolls forward again " +
                     "unless the change is reverted in git. If a DB migration ran, restore the pre-deploy dump (RUNBOOK 13.3)."
            }
        }

        stage('Verify') {
            when { expression { mode() in ['deploy', 'verify', 'rollback'] } }
            steps {
                onServer("ansible-playbook playbooks/verify.yml -e mds_env=${targetEnv()} -e verify_external=false \$V")
                smokeTest(HOSTS[targetEnv()])
            }
        }
    }

    post {
        failure {
            script {
                if (mode() == 'lint') { return }
                try {
                    onServer("""
kubectl describe node | sed -n '/Allocated resources/,/Events/p' || true
kubectl -n ${targetEnv()} get pods -o wide || true
kubectl -n ${targetEnv()} get events --sort-by=.lastTimestamp | tail -n 25 || true
kubectl -n ${targetEnv()} logs deploy/mds-ui -c ui --tail=40 || true
""")
                } catch (err) {
                    echo "Diagnostics failed: ${err}"
                }
            }
        }
        always {
            sh 'rm -rf .remote.sh .docker-ecr'
        }
    }
}
