import os
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    PROJECT_NAME: str = "WolfLink"
    API_V1_STR: str = "/api"
    
    # Base directory
    BASE_DIR: str = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    
    # Database
    DATABASE_URL: str = f"sqlite:///{os.path.join(BASE_DIR, 'wolflink.db')}"

    model_config = SettingsConfigDict(env_file=".env", case_sensitive=True)

settings = Settings()
