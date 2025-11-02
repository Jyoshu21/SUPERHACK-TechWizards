# backend/tools.py - Tools module for FastAPI backend

import json
from datetime import datetime, timedelta
import random
from strands import tool
from thefuzz import process

# --- (Global variables and initialize_tools_data remain the same) ---
_GUARDIANOPS_DATASET = {}
_SERVICE_DEPENDENCIES_GRAPH = {}
_SERVICE_CRITICALITY_MAP = {}
_SERVICE_ALIASES = {}

def initialize_tools_data(dataset, dep_graph, crit_map, aliases):
    """Initializes the shared dataset and helper maps for all tools."""
    global _GUARDIANOPS_DATASET, _SERVICE_DEPENDENCIES_GRAPH, _SERVICE_CRITICALITY_MAP, _SERVICE_ALIASES
    _GUARDIANOPS_DATASET = dataset
    _SERVICE_DEPENDENCIES_GRAPH = dep_graph
    _SERVICE_CRITICALITY_MAP = crit_map
    _SERVICE_ALIASES = aliases
    print("Tools data initialized successfully.")


# --- MODIFIED: This function is now safer and handles the None case ---
def _normalize_service_name(name: str) -> str:
    """Helper to normalize input service names using fuzzy matching against the known service list."""
    if not name:
        return name

    aliased_name = _SERVICE_ALIASES.get(name.lower().strip(), name)
    known_services = list(_SERVICE_DEPENDENCIES_GRAPH.keys())

    # Use fuzzy matching to find the best match
    match_result = process.extractOne(aliased_name, known_services, score_cutoff=85)

    # --- THIS IS THE FIX ---
    # Check if a match was found before trying to unpack it
    if match_result:
        best_match, score = match_result
        # For debugging: print(f"Normalized '{name}' -> '{best_match}' with score {score}")
        return best_match

    # If no good match is found (match_result is None), return the original (aliased) name
    return aliased_name


# --- (The rest of the file remains exactly the same) ---
@tool
def assess_technical_risk(change_type: str, documentation_notes: str, priority: str, target_systems: list) -> dict:
    print(f"Tool Call: assess_technical_risk(ChangeType='{change_type}', Notes='{documentation_notes[:50]}...', Priority='{priority}', Targets={target_systems})")
    
    risk_score_multiplier = 1.0
    technical_summary_factors = []

    normalized_target_systems = [_normalize_service_name(s) for s in target_systems if s]

    if "database" in documentation_notes.lower() or "schema" in documentation_notes.lower() or "db" in documentation_notes.lower():
        risk_score_multiplier += 0.3
        technical_summary_factors.append("Database-related change")
    if "security" in documentation_notes.lower():
        risk_score_multiplier += 0.2
        technical_summary_factors.append("Security related")
    if "rollback" in documentation_notes.lower():
        risk_score_multiplier -= 0.1 
        technical_summary_factors.append("Rollback plan mentioned")

    if priority == "Critical":
        risk_score_multiplier += 0.5
        technical_summary_factors.append("Critical priority")
    elif priority == "High":
        risk_score_multiplier += 0.3
        technical_summary_factors.append("High priority")
    
    related_failures = [
        f for f in _GUARDIANOPS_DATASET.get('historicalFailures', [])
        if any(s.lower() in f.get('title', '').lower() or f.get('category', '').lower() == change_type.lower() for s in normalized_target_systems) or
           any(target_svc.lower() in f_svc.lower() for target_svc in normalized_target_systems for f_svc in f.get('affectedServices', []))
    ]
    if related_failures:
        risk_score_multiplier += len(related_failures) * 0.2
        technical_summary_factors.append(f"{len(related_failures)} past incidents related to this type/target.")

    base_risk = random.uniform(2.0, 7.0) 
    technical_risk_score = round(min(base_risk * risk_score_multiplier, 10.0), 1)

    technical_summary = "Simulated technical risk: " + (", ".join(technical_summary_factors) if technical_summary_factors else "General assessment.")

    return {
        "technical_risk_score": technical_risk_score,
        "technical_summary": technical_summary
    }

@tool
def analyze_service_dependencies(target_systems: list) -> dict:
    print(f"Tool Call: analyze_service_dependencies(Targets={target_systems})")
    
    impacted_dependencies = set()
    
    normalized_target_systems = [_normalize_service_name(s) for s in target_systems if s]
    all_target_systems_set = set(normalized_target_systems)

    def find_downstream(system_name):
        normalized_system = _normalize_service_name(system_name)
        if normalized_system in _SERVICE_DEPENDENCIES_GRAPH:
            for dep in _SERVICE_DEPENDENCIES_GRAPH[normalized_system]:
                normalized_dep = _normalize_service_name(dep)
                if normalized_dep not in impacted_dependencies and normalized_dep not in all_target_systems_set:
                    impacted_dependencies.add(normalized_dep)
                    find_downstream(normalized_dep)
            
            for service_info in _GUARDIANOPS_DATASET.get('serviceDependencies', []):
                current_svc_name = _normalize_service_name(service_info['serviceName'])
                consumed_by_list = [_normalize_service_name(c) for c in service_info.get('consumedBy', [])]
                if normalized_system in consumed_by_list:
                    if current_svc_name not in impacted_dependencies and current_svc_name not in all_target_systems_set:
                        impacted_dependencies.add(current_svc_name)

    for system in normalized_target_systems:
        find_downstream(system)
    
    all_involved_services = all_target_systems_set.union(impacted_dependencies)
    
    final_impacted_only_downstream = sorted(list(impacted_dependencies - all_target_systems_set))

    dependency_summary = f"Change impacts {len(final_impacted_only_downstream)} additional downstream services beyond targeted systems."
    if not final_impacted_only_downstream:
        dependency_summary = "No significant additional downstream dependencies detected."

    return {
        "target_systems_analyzed": sorted(list(all_target_systems_set)),
        "impacted_dependencies": final_impacted_only_downstream,
        "dependency_summary": dependency_summary,
        "all_involved_services": sorted(list(all_involved_services))
    }

@tool
def assess_business_impact(proposed_datetime_str: str, all_involved_services: list) -> dict:
    print(f"Tool Call: assess_business_impact(ProposedDateTime='{proposed_datetime_str}', InvolvedServices={all_involved_services})")
    
    proposed_dt = datetime.fromisoformat(proposed_datetime_str)
    
    current_impact_events = []
    overall_business_risk_score = 0
    
    normalized_involved_services = [_normalize_service_name(s) for s in all_involved_services if s]

    for event_data in _GUARDIANOPS_DATASET.get('businessEvents', []):
        event_start_dt = datetime.fromisoformat(event_data['startDate'])
        event_end_dt = datetime.fromisoformat(event_data['endDate']) + timedelta(days=1, seconds=-1)

        if event_start_dt <= proposed_dt <= event_end_dt:
            impact_match = False
            if "all-systems" in event_data['impactedSystems']:
                impact_match = True
            else:
                for service in normalized_involved_services:
                    if service.lower() in [_normalize_service_name(sys).lower() for sys in event_data.get('impactedSystems', [])]:
                        impact_match = True
                        break

            if impact_match:
                level = event_data['criticality']
                current_impact_events.append({"date": proposed_dt.strftime("%b %d"), "event": event_data['eventName'], "level": level})
                
                if level == "Critical":
                    overall_business_risk_score += 5
                elif level == "High":
                    overall_business_risk_score += 3
                elif level == "Medium":
                    overall_business_risk_score += 1

                if event_data.get('blackoutWindow', False):
                    overall_business_risk_score += 2

    is_weekday_business_hours = proposed_dt.isoweekday() <= 5 and proposed_dt.hour >= 9 and proposed_dt.hour <= 17
    if is_weekday_business_hours and not any(e for e in current_impact_events if e['event'] in ["Peak Hours", "Monthly Payroll Processing", "Black Friday Sale Preparation"]):
        overall_business_risk_score += 1
        current_impact_events.append({"date": proposed_dt.strftime("%b %d"), "event": "Peak Hours", "level": "Peak"})

    business_impact_final_level = "Low"
    if any(e['level'] == 'Critical' for e in current_impact_events):
        business_impact_final_level = "High"
    elif any(e['level'] == 'High' for e in current_impact_events):
        business_impact_final_level = "Medium"
    elif any(e['level'] == 'Medium' for e in current_impact_events) and business_impact_final_level not in ["High"]:
        business_impact_final_level = "Medium"
    elif not current_impact_events:
        business_impact_final_level = "Low"
    else: 
        business_impact_final_level = "Low"

    business_impact_timeline_display = []
    
    if not current_impact_events:
        business_impact_timeline_display.append({"date": (proposed_dt - timedelta(days=1)).strftime("%b %d"), "event": "Safe Window", "level": "Safe"})
        business_impact_timeline_display.append({"date": proposed_dt.strftime("%b %d"), "event": "Proposed Change", "level": "Safe"})
        business_impact_timeline_display.append({"date": (proposed_dt + timedelta(days=1)).strftime("%b %d"), "event": "Safe Window", "level": "Safe"})
    else:
        proposed_time_level = "Safe"
        if "High" in business_impact_final_level or "Critical" in [e['level'] for e in current_impact_events]:
            proposed_time_level = "Conflict"
        elif "Medium" in business_impact_final_level or "Peak" in [e['level'] for e in current_impact_events]:
            proposed_time_level = "Peak"

        business_impact_timeline_display.append({"date": proposed_dt.strftime("%b %d"), "event": "Proposed Change", "level": proposed_time_level})
        
        for event_item in current_impact_events:
            event_dt_str = proposed_dt.strftime("%b %d")
            if 'startDate' in event_item:
                 event_dt_obj = datetime.fromisoformat(event_item['startDate'])
                 if event_dt_obj.date() != proposed_dt.date():
                    event_dt_str = event_dt_obj.strftime("%b %d")
            
            if not (event_dt_str == proposed_dt.strftime("%b %d") and event_item['event'] == "Proposed Change"):
                business_impact_timeline_display.append({"date": event_item['date'], "event": event_item['event'], "level": event_item['level']})

    unique_timeline_items = {}
    for item in business_impact_timeline_display:
        try:
            date_key = datetime.strptime(item['date'], "%b %d").date()
        except ValueError:
            date_key = proposed_dt.date()
        
        if date_key not in unique_timeline_items:
            unique_timeline_items[date_key] = item
        else:
            existing_level = unique_timeline_items[date_key]['level']
            new_level = item['level']
            level_priority = {"Critical": 6, "High": 5, "Medium": 4, "Peak": 3, "Conflict": 2, "Safe": 1, "Low": 0, "Proposed Change": 0}
            if level_priority.get(new_level, 0) > level_priority.get(existing_level, 0):
                unique_timeline_items[date_key] = item
            elif level_priority.get(new_level, 0) == level_priority.get(existing_level, 0):
                if item['event'] not in unique_timeline_items[date_key]['event']:
                    unique_timeline_items[date_key]['event'] += f", {item['event']}"

    sorted_timeline = sorted(list(unique_timeline_items.values()), key=lambda x: datetime.strptime(x['date'], "%b %d"))

    business_summary = f"Business impact level: {business_impact_final_level}. Conflicts identified: {', '.join([e['event'] for e in current_impact_events]) if current_impact_events else 'None.'}"

    return {
        "business_impact_level": business_impact_final_level,
        "overall_business_risk_score": overall_business_risk_score,
        "business_impact_timeline": sorted_timeline,
        "business_summary": business_summary
    }

@tool
def get_historical_recommendations(change_type: str, target_systems: list) -> list:
    print(f"Tool Call: get_historical_recommendations(ChangeType='{change_type}', Targets={target_systems})")
    
    normalized_target_systems = [_normalize_service_name(s) for s in target_systems if s]
    
    historical_recs = []
    for ra in _GUARDIANOPS_DATASET.get('riskAssessments', []):
        if (any(ts.lower() in ra.get('changeId', '').lower() or ts.lower() in ra.get('title', '').lower() for ts in normalized_target_systems) or
            change_type.lower() in ra.get('changeId', '').lower() or change_type.lower() in ra.get('title', '').lower()):
            
            historical_recs.extend(ra.get('recommendations', []))
            if ra.get('safestWindow'):
                historical_recs.append(f"Safest Window Identified: {ra['safestWindow']} based on historical data.")
            if ra.get('estimatedBlastRadius'):
                historical_recs.append(f"Estimated Blast Radius: {ra['estimatedBlastRadius']}.")
    
    return list(set(historical_recs))

