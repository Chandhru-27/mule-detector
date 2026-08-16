from fastapi import Request
from app.services.simulator_service import SimulatorService


def get_simulator(request: Request) -> SimulatorService:
    """
    Pulls the SimulatorService instance from app.state.
    app.state is set once in lifespan same object reused for every request.
    """
    return request.app.state.simulator
