import os


# --- File Paths ---
# Get the absolute path to the project root (parent of backend directory)
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(BACKEND_DIR)
DATASET_PATH = os.path.join(PROJECT_ROOT, 'guardianops_complete_dataset.json')

# --- Risk Calculation Parameters ---
# Weights for the risk score formula. They should sum to 1.0.
RISK_WEIGHTS = {
    'technical': 0.4,
    'dependency': 0.3,
    'business': 0.3
}

# Additive risk score based on change priority.
PRIORITY_ADJUSTMENTS = {
    'High': 1.5,
    'Critical': 3.0
}

# The theoretical maximum risk score before normalization.
# A safe upper bound for ((tech_score * 0.4) + (dep_count * 0.3) + (biz_score * 0.3)) + priority_adjustment
MAX_CALCULATED_RISK = 15.0
