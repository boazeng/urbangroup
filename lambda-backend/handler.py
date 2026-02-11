"""
Lambda handler - wraps Flask app with Mangum for API Gateway.
"""
import os

os.environ.setdefault("IS_LAMBDA", "true")

from mangum import Mangum
from server import app

handler = Mangum(app, lifespan="off")
