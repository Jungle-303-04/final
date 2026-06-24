# Windows WSL Setup

Windows에서는 WSL2 Ubuntu 안에 repo를 두는 것을 권장합니다.

좋은 위치:

```text
/home/<user>/workspace/SW_AI_W17-21-final
```

피할 위치:

```text
/mnt/c/Users/...
```

Docker Desktop에서 WSL integration을 켠 뒤 WSL 터미널에서 실행합니다.

```bash
sudo apt update
sudo apt install -y git curl
bash scripts/doctor.sh
uv sync
bash scripts/dev.sh
```
