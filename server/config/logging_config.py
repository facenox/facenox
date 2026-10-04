import os


def get_logging_config():
    """
    Get the logging configuration.
    This is generated dynamically to ensure it uses the correct paths
    resolved at runtime.
    """
    from config.paths import DATA_DIR

    # Define base configuration
    config = {
        "version": 1,
        "disable_existing_loggers": False,
        "formatters": {
            "default": {
                "format": "%(asctime)s - %(name)s - %(levelname)s - %(message)s",
            },
        },
        "handlers": {
            "console": {
                "class": "logging.StreamHandler",
                "level": "INFO",
                "formatter": "default",
                "stream": "ext://sys.stdout",
            },
            "file": {
                "class": "logging.handlers.RotatingFileHandler",
                "level": "INFO",
                "formatter": "default",
                "filename": str(DATA_DIR / "server.log"),
                "maxBytes": 10485760,  # 10MB
                "backupCount": 5,
                "encoding": "utf8",
            },
        },
        "loggers": {
            "": {
                "level": "INFO",
                "handlers": ["console", "file"],
            },
            "uvicorn": {
                "level": "INFO",
                "handlers": ["console", "file"],
                "propagate": False,
            },
            "uvicorn.error": {
                "level": "INFO",
                "handlers": ["console", "file"],
                "propagate": False,
            },
            "uvicorn.access": {
                "level": "INFO",
                "handlers": ["console", "file"],
                "propagate": False,
            },
            "fastapi": {
                "level": "INFO",
                "handlers": ["console", "file"],
                "propagate": False,
            },
            "httpx": {
                "level": "WARNING",
                "handlers": ["file"],
                "propagate": False,
            },
            "httpcore": {
                "level": "WARNING",
                "handlers": ["file"],
                "propagate": False,
            },
            "sqlalchemy.engine": {
                "level": "WARNING",
                "handlers": ["console", "file"],
                "propagate": False,
            },
        },
    }

    # Default to production-safe logging. Set ENVIRONMENT=development for verbose output.
    env = os.getenv("ENVIRONMENT", "production")
    if env != "development":
        config["handlers"]["console"]["level"] = "WARNING"

    return config
