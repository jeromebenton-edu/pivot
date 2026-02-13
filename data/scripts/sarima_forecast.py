#!/usr/bin/env python3
"""
SARIMA Forecasting for January 2025 Revenue
Uses historical monthly revenue data to forecast next month's revenue
"""

import json
import pandas as pd
import numpy as np
from datetime import datetime
import warnings
warnings.filterwarnings('ignore')

# Try importing required libraries
try:
    from statsmodels.tsa.statespace.sarimax import SARIMAX
    from statsmodels.tsa.seasonal import seasonal_decompose
    import matplotlib.pyplot as plt
except ImportError as e:
    print(f"Error: Required library not installed. {e}")
    print("\nPlease install required packages:")
    print("pip install statsmodels pandas numpy matplotlib")
    exit(1)

def load_monthly_revenue():
    """Load monthly revenue data from the data chunks"""
    with open('../samples/data_chunks.json', 'r') as f:
        chunks = json.load(f)

    monthly_data = []
    for chunk in chunks:
        if chunk.get('metadata', {}).get('type') == 'monthly_summary':
            monthly_data.append({
                'month': chunk['metadata']['month'],
                'revenue': chunk['metadata']['revenue']
            })

    # Sort by month
    monthly_data.sort(key=lambda x: x['month'])
    return monthly_data

def prepare_time_series(monthly_data):
    """Convert monthly data to a time series DataFrame"""
    df = pd.DataFrame(monthly_data)
    df['month'] = pd.to_datetime(df['month'])
    df = df.set_index('month')
    df = df.sort_index()
    return df

def fit_sarima_model(df, order=(1,1,1), seasonal_order=(1,1,1,12)):
    """
    Fit SARIMA model to the revenue data

    Parameters:
    - order: (p,d,q) for ARIMA
    - seasonal_order: (P,D,Q,s) for seasonal component
    """
    print(f"Fitting SARIMA model with order={order}, seasonal_order={seasonal_order}")

    try:
        model = SARIMAX(df['revenue'],
                       order=order,
                       seasonal_order=seasonal_order,
                       enforce_stationarity=False,
                       enforce_invertibility=False)

        results = model.fit(disp=False)
        print(f"Model AIC: {results.aic:.2f}")
        print(f"Model BIC: {results.bic:.2f}")

        return results
    except Exception as e:
        print(f"Error fitting model: {e}")
        # Fall back to simpler model
        print("Falling back to simpler ARIMA(1,1,1) model without seasonal component")
        model = SARIMAX(df['revenue'],
                       order=(1,1,1),
                       enforce_stationarity=False,
                       enforce_invertibility=False)
        return model.fit(disp=False)

def forecast_revenue(results, steps=1):
    """Forecast future revenue"""
    forecast = results.forecast(steps=steps)
    return forecast

def main():
    print("=" * 60)
    print("SARIMA Revenue Forecasting for January 2025")
    print("=" * 60)

    # Load and prepare data
    print("\n1. Loading monthly revenue data...")
    monthly_data = load_monthly_revenue()

    print(f"Found {len(monthly_data)} months of data")
    print("\nMonthly Revenue Summary:")
    for item in monthly_data:
        print(f"  {item['month']}: ${item['revenue']:,.2f}")

    # Prepare time series
    print("\n2. Preparing time series...")
    df = prepare_time_series(monthly_data)

    # Calculate basic statistics
    print(f"\nRevenue Statistics:")
    print(f"  Mean: ${df['revenue'].mean():,.2f}")
    print(f"  Std: ${df['revenue'].std():,.2f}")
    print(f"  Min: ${df['revenue'].min():,.2f}")
    print(f"  Max: ${df['revenue'].max():,.2f}")

    # Fit SARIMA model
    print("\n3. Fitting SARIMA model...")

    # Since we only have 12 months of data, we'll use a simpler model
    # With limited data, complex seasonal models may not converge
    if len(df) < 24:
        print("Note: Limited data available. Using simplified ARIMA model.")
        results = fit_sarima_model(df, order=(1,1,1), seasonal_order=(0,0,0,0))
    else:
        results = fit_sarima_model(df, order=(1,1,1), seasonal_order=(1,1,1,12))

    # Make forecast
    print("\n4. Forecasting January 2025...")
    forecast = forecast_revenue(results, steps=1)
    jan_2025_revenue = forecast.iloc[0]

    # Calculate confidence intervals
    forecast_df = results.get_forecast(steps=1)
    confidence_intervals = forecast_df.conf_int()
    lower_bound = confidence_intervals.iloc[0, 0]
    upper_bound = confidence_intervals.iloc[0, 1]

    # Display results
    print("\n" + "=" * 60)
    print("FORECAST RESULTS")
    print("=" * 60)
    print(f"\nJanuary 2025 Revenue Forecast:")
    print(f"  Point Forecast: ${jan_2025_revenue:,.2f}")
    print(f"  95% Confidence Interval: [${lower_bound:,.2f}, ${upper_bound:,.2f}]")

    # Compare with historical average
    avg_revenue = df['revenue'].mean()
    pct_diff = ((jan_2025_revenue - avg_revenue) / avg_revenue) * 100
    print(f"\nComparison:")
    print(f"  Historical Average: ${avg_revenue:,.2f}")
    print(f"  Forecast vs Average: {pct_diff:+.1f}%")

    # Save forecast to file
    forecast_result = {
        'forecast_date': '2025-01',
        'point_forecast': float(jan_2025_revenue),
        'confidence_interval': {
            'lower': float(lower_bound),
            'upper': float(upper_bound)
        },
        'model_info': {
            'type': 'SARIMA',
            'order': str(results.specification['order']),
            'seasonal_order': str(results.specification['seasonal_order']),
            'aic': float(results.aic),
            'bic': float(results.bic)
        },
        'historical_data': monthly_data
    }

    with open('../samples/forecast_result.json', 'w') as f:
        json.dump(forecast_result, f, indent=2)
    print(f"\nForecast saved to: data/samples/forecast_result.json")

    # Plot if matplotlib is available
    try:
        print("\n5. Generating visualization...")
        fig, ax = plt.subplots(figsize=(12, 6))

        # Plot historical data
        df['revenue'].plot(ax=ax, label='Historical Revenue', marker='o')

        # Plot forecast
        forecast_index = pd.date_range(start='2025-01', periods=1, freq='MS')
        ax.plot(forecast_index, [jan_2025_revenue], 'ro', markersize=10, label='Forecast')
        ax.fill_between(forecast_index, [lower_bound], [upper_bound],
                        color='red', alpha=0.2, label='95% CI')

        ax.set_title('Revenue Forecast for January 2025', fontsize=14, fontweight='bold')
        ax.set_xlabel('Month')
        ax.set_ylabel('Revenue ($)')
        ax.legend()
        ax.grid(True, alpha=0.3)

        # Format y-axis
        ax.yaxis.set_major_formatter(plt.FuncFormatter(lambda x, p: f'${x:,.0f}'))

        plt.tight_layout()
        plt.savefig('../samples/revenue_forecast.png', dpi=150)
        print("Visualization saved to: data/samples/revenue_forecast.png")
        plt.show()
    except Exception as e:
        print(f"Could not generate visualization: {e}")

    print("\n" + "=" * 60)
    print("Forecasting complete!")
    print("=" * 60)

if __name__ == "__main__":
    main()