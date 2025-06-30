import subprocess
from concurrent.futures import ThreadPoolExecutor

def build_app():
    subprocess.call(["npx", "tsc", "--watch"])


def start_dev():
    subprocess.call(["npx", "nodemon", "dist/main.js"])

try:

    with ThreadPoolExecutor(max_workers=2) as executor:
        executor.submit(build_app)
        executor.submit(start_dev)
except KeyboardInterrupt:
    print("\n🥱Ughh your keyboard interrupt")

