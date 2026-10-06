import logging
import os


class AccessLogFilter(logging.Filter):
    """
    Suppresses routine root health check ('GET /') and CORS preflight ('OPTIONS')
    access logs to keep console and log files focused on meaningful events.
    """

    def filter(self, record: logging.LogRecord) -> bool:
        if not record.args:
            return True

        args_str = " ".join(str(a) for a in record.args)

        # Suppress routine root health check returning 200 OK
        if (
            "GET / " in args_str or 'GET /"' in args_str or "GET / HTTP" in args_str
        ) and "200" in args_str:
            return False

        # Suppress routine CORS preflight returning 200 OK
        if "OPTIONS " in args_str and "200" in args_str:
            return False

        return True


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
        "filters": {
            "access_filter": {
                "()": AccessLogFilter,
            },
        },
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
                "filters": ["access_filter"],
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
