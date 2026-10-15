// =============================================================================
// CI/CD for the standalone MDS (OpenG2P Master Data Service).
//
// Branch -> environment on the MDS-dev-staging server (single-node RKE2):
//   develop  -> namespace "develop"  https://mds-dev.oanstaging.com      (automatic)
//   staging  -> namespace "staging"  https://mds-staging.mda.test        (after approval)
//   anything else (main, feature branches, PRs) -> lint only, nothing is deployed
//
// The API/UI images are the official openg2p/* images; this repo provides the
// customisations around them. A deploy:
//   1. lints the Python/JS files and docker-compose.yml
//   2. ships customize_sidebar.js to the server as a UI hook
//      (ansible/files/mds-hooks/, mounted into the UI pod at /opt/mds-hooks)
//      and the catalog scripts + data/ to ansible/files/catalog-scripts/
//   3. runs the Ansible playbooks on the server, which already holds the
//      inventory, the per-environment vaults and ~/.mds_vault_pass:
//      backup.yml -> 03-deploy-mds.yml -> verify.yml, then an HTTPS smoke test
//
// docker_proxy.py / docker_proxy.js are local-only (compose) and are not shipped.
//
// Jenkins setup:
//   - Multibranch Pipeline job on this repository
//   - Credential "mds-dev-staging-ssh" (SSH Username with private key), user "ubuntu"
//   - Linux agent with ssh, tar, curl, python3 and node (docker optional)
//   - The server's security group must allow SSH (22) from the Jenkins agent
// =============================================================================

// No "def": a script binding, so it is visible inside the declarative stages.
BRANCH_ENV = [develop: 'develop', staging: 'staging']
HOSTS = [
    develop: [ui: 'mds-dev.oanstaging.com', api: 'mds-api-dev.oanstaging.com'],
    staging: [ui: 'mds-staging.mda.test',   api: 'mds-api-staging.mda.test'],
]

def targetEnv() {
    return BRANCH_ENV[env.BRANCH_NAME]
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
    withCredentials([sshUserPrivateKey(credentialsId: env.SSH_CREDENTIALS,
                                       keyFileVariable: 'SSH_KEY', usernameVariable: 'SSH_USER')]) {
        sh 'ssh -i "$SSH_KEY" $SSH_OPTS "$SSH_USER@$MDS_HOST" "bash -s" < .remote.sh'
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
    triggers {
        pollSCM(env.BRANCH_NAME in ['develop', 'staging'] ? 'H/5 * * * *' : '')
    }

    parameters {
        choice(name: 'ACTION', choices: ['deploy', 'verify', 'backup', 'rollback'],
               description: '''Only on the develop / staging branches (a push always runs "deploy").
deploy   = backup, ship hooks + catalog files, 03-deploy-mds, verify, smoke test
verify   = verify.yml + smoke test
backup   = backup.yml (in-cluster job + pg_dump kept on the server, newest 5)
rollback = kubectl rollout undo of mds-api and mds-ui''')
        booleanParam(name: 'BACKUP_BEFORE_DEPLOY', defaultValue: true,
                     description: 'deploy: run backup.yml first')
        booleanParam(name: 'SEED_AFTER_DEPLOY', defaultValue: false,
                     description: 'deploy: run 04-seed-catalogs (official ETH pack; unchanged lists are skipped, changed ones become DRAFTs)')
        string(name: 'API_IMAGE', defaultValue: '', trim: true,
               description: 'deploy: override mds_api_image for this run, e.g. openg2p/master-data-api:1.2.0 (blank = server setting)')
        string(name: 'UI_IMAGE', defaultValue: '', trim: true,
               description: 'deploy: override mds_ui_image for this run (blank = server setting)')
    }

    environment {
        MDS_HOST        = 'ec2-13-233-134-2.ap-south-1.compute.amazonaws.com'
        MDS_IP          = '13.233.134.2'
        SSH_CREDENTIALS = 'mds-dev-staging-ssh'
        SSH_OPTS        = '-o StrictHostKeyChecking=accept-new -o BatchMode=yes -o ServerAliveInterval=30'
    }

    stages {
        stage('Lint') {
            steps {
                script {
                    [params.API_IMAGE, params.UI_IMAGE].each { img ->
                        if (img && !(img ==~ /^[A-Za-z0-9._\/:@-]+$/)) {
                            error "Invalid image reference: '${img}'"
                        }
                    }
                    currentBuild.description = targetEnv() ? "${params.ACTION} -> ${targetEnv()}" : 'lint only'
                }
                sh '''
                    set -e
                    python3 -m py_compile *.py && echo "python: OK"
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

        stage('Approve staging') {
            when { expression { targetEnv() == 'staging' && params.ACTION in ['deploy', 'rollback'] } }
            steps {
                timeout(time: 60, unit: 'MINUTES') {
                    input message: "Run '${params.ACTION}' on staging (${env.GIT_COMMIT?.take(8)})?",
                          ok: "Yes, ${params.ACTION} staging"
                }
            }
        }

        stage('Backup') {
            when { expression { targetEnv() && (params.ACTION == 'backup' || (params.ACTION == 'deploy' && params.BACKUP_BEFORE_DEPLOY)) } }
            steps {
                onServer("""
ansible-playbook playbooks/backup.yml -e mds_env=${targetEnv()} \$V
ls -1t artifacts/backups/${targetEnv()}/*.dump 2>/dev/null | tail -n +6 | xargs -r rm -f
""")
            }
        }

        stage('Ship files to server') {
            when { expression { targetEnv() && params.ACTION == 'deploy' } }
            steps {
                withCredentials([sshUserPrivateKey(credentialsId: env.SSH_CREDENTIALS,
                                                   keyFileVariable: 'SSH_KEY', usernameVariable: 'SSH_USER')]) {
                    // Every *.js / *.py in mds-hooks/ ends up in the UI/API pods, so only the
                    // sidebar hook goes there. Scripts + data go to catalog-scripts/ (not run).
                    sh '''
                        tar -czf - customize_sidebar.js \
                            import_all_catalogs.py import_input_catalog.py add_geography_to_catalogs.py \
                            sync_catalog_data.py parse_sql.py data \
                        | ssh -i "$SSH_KEY" $SSH_OPTS "$SSH_USER@$MDS_HOST" '
                            set -e
                            A=~/MDS-service/ansible/files
                            STAGE=$(mktemp -d)
                            tar -xzf - -C "$STAGE"
                            find "$STAGE" -type f \\( -name "*.js" -o -name "*.py" -o -name "*.sql" \\) -exec sed -i "s/\\r$//" {} +
                            install -m 0644 "$STAGE/customize_sidebar.js" "$A/mds-hooks/customize_sidebar.js"
                            mkdir -p "$A/catalog-scripts"
                            cp -r "$STAGE"/*.py "$STAGE/data" "$A/catalog-scripts/"
                            rm -rf "$STAGE"
                            echo "Shipped commit '"$GIT_COMMIT"' to $A"'
                    '''
                }
            }
        }

        stage('Deploy') {
            when { expression { targetEnv() && params.ACTION == 'deploy' } }
            steps {
                script {
                    def overrides = ''
                    if (params.API_IMAGE) { overrides += " -e mds_api_image=${params.API_IMAGE}" }
                    if (params.UI_IMAGE)  { overrides += " -e mds_ui_image=${params.UI_IMAGE}" }
                    onServer("ansible-playbook playbooks/03-deploy-mds.yml -e mds_env=${targetEnv()}${overrides} \$V")
                    if (params.SEED_AFTER_DEPLOY) {
                        onServer("ansible-playbook playbooks/04-seed-catalogs.yml -e mds_env=${targetEnv()} \$V")
                    }
                }
            }
        }

        stage('Rollback') {
            when { expression { targetEnv() && params.ACTION == 'rollback' } }
            steps {
                onServer("""
kubectl -n ${targetEnv()} rollout undo deploy/mds-api
kubectl -n ${targetEnv()} rollout undo deploy/mds-ui
kubectl -n ${targetEnv()} rollout status deploy/mds-api --timeout=10m
kubectl -n ${targetEnv()} rollout status deploy/mds-ui  --timeout=10m
""")
                echo "Rolled back ${targetEnv()}. The next deploy rolls forward again unless the change is reverted in git. " +
                     "If a DB migration ran, restore the pre-deploy dump (RUNBOOK 13.3)."
            }
        }

        stage('Verify') {
            when { expression { targetEnv() && params.ACTION in ['deploy', 'verify', 'rollback'] } }
            steps {
                onServer("ansible-playbook playbooks/verify.yml -e mds_env=${targetEnv()} -e verify_external=false \$V")
                smokeTest(HOSTS[targetEnv()])
            }
        }
    }

    post {
        failure {
            script {
                if (!targetEnv()) { return }
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
            sh 'rm -f .remote.sh'
        }
    }
}
