import argparse
import logging
import logging.config
import signal
import sys
import traceback

import uvicorn

from config.models import validate_model_paths, validate_directories
from config.logging_config import get_logging_config
from config.server import get_server_config
from config.paths import BASE_DIR
from database.migrate import run_migrations


sys.path.insert(0, str(BASE_DIR))

config = {
    "server": get_server_config(),
    "logging": get_logging_config(),
}


def signal_handler(signum, _frame):
    """Handle shutdown signals gracefully"""
    signal_name = (
        "SIGINT"
        if signum == signal.SIGINT
        else "SIGTERM" if signum == signal.SIGTERM else f"Signal {signum}"
    )
    print(f"\nReceived {signal_name} - shutting down gracefully...")
    sys.exit(0)


signal.signal(signal.SIGINT, signal_handler)  # Ctrl+C
signal.signal(signal.SIGTERM, signal_handler)  # Termination request


if sys.platform == "win32":
    try:
        signal.signal(signal.SIGBREAK, signal_handler)  # Windows Ctrl+Break
    except AttributeError:
        pass  # SIGBREAK not available on all platforms


def setup_logging():
    """Setup logging configuration"""
    logging.config.dictConfig(config["logging"])


def validate_setup():
    """Validate the setup before starting the server"""
    try:
        # Validate directories
        validate_directories()

        # Validate model paths
        validate_model_paths()

        return True

    except Exception as e:
        print(f"[FAIL] Setup validation failed: {e}")
        return False


def main():
    """Main entry point"""

    parser = argparse.ArgumentParser(description="Face Detection API Backend")
    parser.add_argument("--port", type=int, help="Port to run the server on")
    parser.add_argument("--host", type=str, help="Host to run the server on")
    args = parser.parse_args()

    setup_logging()
    logger = logging.getLogger(__name__)

    if not validate_setup():
        print("Setup validation failed. Please check the configuration.")
        sys.exit(1)

    run_migrations()

    server_config = config["server"].copy()

    if args.port:
        server_config["port"] = args.port
    if args.host:
        server_config["host"] = args.host

    try:

        from main import app

        logger.info(
            f"Starting server on {server_config['host']}:{server_config['port']}"
        )

        uvicorn.run(
            app,
            host=server_config["host"],
            port=server_config["port"],
            reload=server_config["reload"],
            log_level=server_config["log_level"],
            workers=server_config["workers"],
            access_log=True,
        )

        logger.info("Server stopped gracefully")

    except KeyboardInterrupt:
        logger.info("Received KeyboardInterrupt - exiting...")
        print("\nServer interrupted by user")
        sys.exit(0)
    except SystemExit:
        # Allow sys.exit() to propagate cleanly
        logger.info("Server exiting...")
        raise
    except Exception as e:
        logger.error(f"Server error: {e}")
        print(f"\nServer error: {e}")
        print("Traceback:")
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
