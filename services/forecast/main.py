"""
SARIMAX Forecasting Microservice

Exposes a FastAPI endpoint that accepts monthly revenue data
and returns SARIMAX forecasts with confidence intervals.
"""

import os

from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel, Field
import numpy as np
import pandas as pd
import warnings

warnings.filterwarnings("ignore")

from statsmodels.tsa.statespace.sarimax import SARIMAX

app = FastAPI(title="Pivot Forecast Service", version="1.0.0")

# Shared-secret auth — when FORECAST_API_KEY is set, all non-health
# endpoints require a matching X-API-Key header.
FORECAST_API_KEY = os.environ.get("FORECAST_API_KEY", "")


def _check_api_key(request: Request) -> None:
    if not FORECAST_API_KEY:
        return  # No key configured → open access (local dev)
    provided = request.headers.get("x-api-key", "")
    if provided != FORECAST_API_KEY:
        raise HTTPException(status_code=401, detail="Invalid or missing API key")


class MonthlyDataPoint(BaseModel):
    month: str  # "YYYY-MM"
    revenue: float


class ForecastRequest(BaseModel):
    monthly_data: list[MonthlyDataPoint] = Field(..., min_length=3, max_length=120)
    steps: int = Field(default=3, ge=1, le=24)
    order: list[int] = Field(default=[1, 1, 1], min_length=3, max_length=3)
    seasonal_order: list[int] = Field(default=[1, 1, 1, 12], min_length=4, max_length=4)


class ForecastPoint(BaseModel):
    month: str
    forecast: float
    lower: float
    upper: float


class ForecastResponse(BaseModel):
    forecasts: list[ForecastPoint]
    method: str
    model_aic: float | None = None
    model_bic: float | None = None
    historical_mean: float
    historical_std: float


@app.post("/forecast", response_model=ForecastResponse)
def forecast(req: ForecastRequest, request: Request):
    _check_api_key(request)
    if len(req.monthly_data) < 3:
        raise HTTPException(status_code=400, detail="Need at least 3 months of data")

    # Build DataFrame
    df = pd.DataFrame([{"month": d.month, "revenue": d.revenue} for d in req.monthly_data])
    df["month"] = pd.to_datetime(df["month"])
    df = df.sort_values("month").set_index("month")

    revenues = df["revenue"]
    hist_mean = float(revenues.mean())
    hist_std = float(revenues.std()) if len(revenues) > 1 else 0.0

    order = tuple(req.order)
    seasonal_order = tuple(req.seasonal_order)

    # With fewer than 24 months, drop seasonal component to avoid convergence issues
    if len(revenues) < 24 and seasonal_order[:3] != (0, 0, 0):
        seasonal_order = (0, 0, 0, 0)

    try:
        model = SARIMAX(
            revenues,
            order=order,
            seasonal_order=seasonal_order,
            enforce_stationarity=False,
            enforce_invertibility=False,
        )
        results = model.fit(disp=False, maxiter=200)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Model fitting failed: {e}")

    # Forecast
    fc = results.get_forecast(steps=req.steps)
    predicted = fc.predicted_mean
    ci = fc.conf_int()

    # Build month labels for forecast periods
    last_month = df.index[-1]
    forecast_months = pd.date_range(start=last_month + pd.DateOffset(months=1), periods=req.steps, freq="MS")

    forecasts = []
    for i in range(req.steps):
        point_forecast = round(max(0, float(predicted.iloc[i])), 2)
        lower_bound = round(max(0, float(ci.iloc[i, 0])), 2)
        upper_bound = round(max(0, float(ci.iloc[i, 1])), 2)
        forecasts.append(
            ForecastPoint(
                month=forecast_months[i].strftime("%Y-%m"),
                forecast=point_forecast,
                lower=lower_bound,
                upper=max(upper_bound, point_forecast),
            )
        )

    return ForecastResponse(
        forecasts=forecasts,
        method="SARIMAX",
        model_aic=round(float(results.aic), 2),
        model_bic=round(float(results.bic), 2),
        historical_mean=round(hist_mean, 2),
        historical_std=round(hist_std, 2),
    )


@app.get("/health")
def health():
    return {"status": "ok", "model": "SARIMAX", "version": "1.0.0"}
