"""Trigger a verified revision and wait for the actual deployment result."""
import json
import os
import time
import urllib.request

base = os.environ['COOLIFY_URL'].rstrip('/')
app = os.environ['COOLIFY_APP_UUID']
token = os.environ['COOLIFY_TOKEN']


def api(path, method='GET', payload=None):
    request = urllib.request.Request(
        base + '/api/v1/' + path,
        data=json.dumps(payload).encode() if payload is not None else None,
        headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'},
        method=method,
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.load(response)


api(f'applications/{app}', 'PATCH', {'git_commit_sha': os.environ['DEPLOY_SHA']})
api(f'applications/{app}/envs/bulk', 'PATCH', {'data': [{
    'key': 'FASSO_DEPLOY_REVISION', 'value': os.environ['DEPLOY_SHA'],
    'is_buildtime': True, 'is_runtime': True,
}]})
result = api('deploy', 'POST', {'uuid': app, 'force': False})
deployment = result['deployments'][0]['deployment_uuid']
print('Coolify deployment:', deployment, flush=True)
deadline = time.monotonic() + 2100
while time.monotonic() < deadline:
    state = api(f'deployments/{deployment}')['status']
    print('Status:', state, flush=True)
    if state == 'finished':
        break
    if state in ('failed', 'cancelled'):
        raise SystemExit('Coolify deployment ' + state)
    time.sleep(15)
else:
    raise SystemExit('Timed out waiting for Coolify deployment')

for url, headers in (
    (os.environ['APP_URL'].rstrip('/') + '/api/health', {}),
    (os.environ['API_URL'].rstrip('/') + '/auth/v1/health',
     {'apikey': os.environ['ANON_KEY']}),
):
    for attempt in range(12):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=20) as response:
                if response.status == 200:
                    print('Healthy:', url, flush=True)
                    break
        except Exception:
            if attempt == 11:
                raise
            time.sleep(10)
