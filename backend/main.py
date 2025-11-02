# backend/main.py - FastAPI Backend for AI Risk Radar

import json
import os
import re
from datetime import datetime
from typing import List, Dict, Any, Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
from collections import Counter

import config
import tools
from strands.models import BedrockModel
from strands import Agent

# --- 1. App Initialization & Configuration ---
load_dotenv()

# Import email_service AFTER loading environment variables
from email_service import email_service
app = FastAPI(title="AI Risk Radar API", version="1.0.0")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173", "http://localhost:5174"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

print("FastAPI App Initialized.")

# --- 2. Global Data Storage (In-Memory) ---
GUARDIANOPS_DATASET = {}
SERVICE_DEPENDENCIES_GRAPH = {}
SERVICE_CRITICALITY_MAP = {}
SERVICE_ALIASES = {}
active_change_requests = []
risk_history_items = []  # Combined risk history: past incidents + completed changes
ai_risk_agent = None

# --- 3. Pydantic Models ---
class ChangeRequest(BaseModel):
    change_type: str
    priority: str
    target_systems: List[str]
    proposed_datetime: str
    documentation_notes: str

class RejectRequest(BaseModel):
    reason: str
    feedbackType: str = "none"

class ReassessBusinessImpact(BaseModel):
    proposed_datetime: str
    all_involved_services: List[str]

class PostmortemRequest(BaseModel):
    title: str
    root_cause: str

class EmailNotificationRequest(BaseModel):
    change_id: str
    recipient_email: str

# --- 4. Load and Process Data ---
@app.on_event("startup")
async def startup_event():
    global GUARDIANOPS_DATASET, SERVICE_DEPENDENCIES_GRAPH, SERVICE_CRITICALITY_MAP
    global SERVICE_ALIASES, active_change_requests, risk_history_items, ai_risk_agent
    
    try:
        with open(config.DATASET_PATH, 'r') as f:
            GUARDIANOPS_DATASET = json.load(f)
        print(f"Successfully loaded dataset from {config.DATASET_PATH}")

        # Process data and create helper maps
        SERVICE_DEPENDENCIES_GRAPH = {
            s['serviceName']: s.get('directDependencies', [])
            for s in GUARDIANOPS_DATASET.get('serviceDependencies', [])
        }
        SERVICE_CRITICALITY_MAP = {
            s['serviceName']: s.get('criticalityScore', 50)
            for s in GUARDIANOPS_DATASET.get('serviceDependencies', [])
        }
        SERVICE_ALIASES = {
            "database server": "Database Server",
            "api gateway": "API Gateway",
            "authservice": "auth-service",
            "paymentgateway": "payment-api",
            "user database": "user-database",
            "billing service": "billing-service",
            "checkout ui": "checkout-ui",
            "payment api": "payment-api",
            "auth service": "auth-service"
        }
        
        # Initialize the tools module with the processed data
        tools.initialize_tools_data(
            GUARDIANOPS_DATASET,
            SERVICE_DEPENDENCIES_GRAPH,
            SERVICE_CRITICALITY_MAP,
            SERVICE_ALIASES
        )

        # Prepare the in-memory list of change requests with defaults
        active_change_requests = GUARDIANOPS_DATASET.get('changeRequests', [])
        for change in active_change_requests:
            if change.get("riskLevel") in ["High", "Critical"]:
                change['status'] = "AI Assessed"
                change['recommendedAction'] = "Review AI Analysis"
            else:
                change['status'] = "Approved"
                change['recommendedAction'] = "Proceed as Planned"

        # Initialize risk history with past incidents from JSON (limit to 10)
        historical_failures = GUARDIANOPS_DATASET.get('historicalFailures', [])[:10]
        risk_history_items = []
        print(f"DEBUG: Found {len(historical_failures)} historical failures in dataset")
        
        for incident in historical_failures:
            # Enrich with risk level from associated change
            related_change = next(
                (c for c in GUARDIANOPS_DATASET.get('changeRequests', [])
                 if c.get("changeId") == incident.get("changeId")),
                None
            )
            incident_copy = incident.copy()
            incident_copy['type'] = 'incident'
            incident_copy['riskLevel'] = related_change.get("riskLevel", "UNKNOWN") if related_change else "UNKNOWN"
            risk_history_items.append(incident_copy)
        
        print(f"Loaded {len(risk_history_items)} historical incidents into risk history")
        print(f"DEBUG: Sample incident data: {risk_history_items[0] if risk_history_items else 'None'}")

    except Exception as e:
        print(f"FATAL: Could not load or process dataset: {e}")
        active_change_requests = []
        risk_history_items = []
        GUARDIANOPS_DATASET = {}
        SERVICE_DEPENDENCIES_GRAPH = {}
        SERVICE_CRITICALITY_MAP = {}
        SERVICE_ALIASES = {}

    # --- 5. Strands AI Agent Setup ---
    try:
        aws_region_name = os.getenv('AWS_REGION_NAME', 'us-east-1')
        bedrock_model_instance = BedrockModel(
            model_id="us.anthropic.claude-sonnet-4-20250514-v1:0",
            region_name=aws_region_name,
            temperature=0.2,
            max_tokens=2048,
            top_p=0.9
        )
        print(f"Strands BedrockModel initialized in region: {aws_region_name}")

        custom_tools = [
            tools.assess_technical_risk,
            tools.analyze_service_dependencies,
            tools.assess_business_impact,
            tools.get_historical_recommendations
        ]

        ai_risk_agent = Agent(
            model=bedrock_model_instance,
            tools=custom_tools,
            name="AI Risk Radar Agent",
            description="An AI agent that assesses IT change risk. It MUST output its final response as a single, valid JSON object."
        )
        print("Strands AI Risk Agent initialized.")
    except Exception as e:
        print(f"FATAL: Error during Strands Agent initialization: {e}")
        ai_risk_agent = None

# --- 6. API Routes ---
@app.get("/")
async def root():
    """Root endpoint"""
    return {"message": "AI Risk Radar API", "version": "1.0.0"}

@app.get("/api/tools_data")
async def get_tools_data():
    """Provides frontend with necessary data for visualizations."""
    return {
        "SERVICE_DEPENDENCIES_GRAPH": SERVICE_DEPENDENCIES_GRAPH,
        "SERVICE_ALIASES": SERVICE_ALIASES,
        "SERVICE_CRITICALITY_MAP": SERVICE_CRITICALITY_MAP,
        "GUARDIANOPS_DATASET": {
            "serviceDependencies": GUARDIANOPS_DATASET.get('serviceDependencies', [])
        }
    }

@app.get("/api/change_overview")
async def get_change_overview():
    """Returns all change requests, sorted with the newest ones first."""
    return sorted(active_change_requests, key=lambda x: x.get('changeId'), reverse=True)

@app.get("/api/pending_approvals")
async def get_pending_approvals():
    """Returns only the change requests that are in the 'AI Assessed' state."""
    return [c for c in active_change_requests if c.get('status') == "AI Assessed"]

@app.get("/api/risk_history")
async def get_risk_history():
    """Returns combined risk history: past incidents + completed change requests.
    Sorted by date (newest first)."""
    print(f"DEBUG: /api/risk_history called - returning {len(risk_history_items)} items")
    if risk_history_items:
        print(f"DEBUG: First item type: {risk_history_items[0].get('type')}")
    sorted_items = sorted(
        risk_history_items,
        key=lambda x: x.get('date') or x.get('completedDate', '2000-01-01'),
        reverse=True
    )
    print(f"DEBUG: Returning sorted list with {len(sorted_items)} items")
    return sorted_items

@app.get("/api/analytics")
async def get_analytics_data():
    """Aggregates comprehensive data for the reports and analytics dashboard."""
    all_changes = active_change_requests
    historical_failures = GUARDIANOPS_DATASET.get('historicalFailures', [])

    # Count total incidents (historical failures + completed changes that resulted in incidents)
    total_incidents = len(risk_history_items)
    
    # Count HIGH and CRITICAL risk changes (dynamic - includes new AI assessments)
    total_high_risk = len([c for c in all_changes if c.get('riskLevel') in ['High', 'Critical', 'HIGH', 'CRITICAL']])
    
    # Calculate downtime from historical incidents
    total_downtime, downtime_count = 0, 0
    for failure in historical_failures:
        match = re.search(r'(\d+\.?\d*)', failure.get('downtime', '0'))
        if match:
            total_downtime += float(match.group(1))
            downtime_count += 1
    avg_downtime = round(total_downtime / downtime_count, 1) if downtime_count > 0 else 0

    # Calculate revenue impact from historical incidents
    total_revenue_impact, impact_count = 0, 0
    for failure in historical_failures:
        try:
            total_revenue_impact += int(failure.get('revenue_impact', '$0').replace('$', '').replace(',', ''))
            impact_count += 1
        except ValueError:
            continue
    avg_revenue_impact = total_revenue_impact // impact_count if impact_count > 0 else 0

    # AI approval rate (dynamic - updates as changes are approved/rejected)
    ai_assessed_changes = [c for c in all_changes if "AI Assessed" in c.get('submittedBy', '')]
    ai_approved_count = len([c for c in ai_assessed_changes if c.get('status') == 'Approved'])
    ai_approval_rate = round((ai_approved_count / len(ai_assessed_changes)) * 100, 1) if ai_assessed_changes else 0

    # DYNAMIC: Risk distribution from all active changes (includes new AI assessments)
    risk_distribution = Counter(c.get('riskLevel') for c in all_changes if c.get('riskLevel'))
    
    # DYNAMIC: Service impact from BOTH historical failures AND new AI-assessed changes
    service_impact_counter = Counter()
    
    # Add historical failures (from dataset)
    all_original_changes = GUARDIANOPS_DATASET.get('changeRequests', [])
    for failure in historical_failures:
        related_change = next(
            (c for c in all_original_changes if c.get("changeId") == failure.get("changeId")),
            None
        )
        if related_change and related_change.get('affectedServices'):
            service_impact_counter.update(related_change['affectedServices'])
    
    # Add NEW AI-assessed changes (dynamic)
    for change in all_changes:
        # Check if this is a new AI-assessed change (not from original dataset)
        if change.get('changeId', '').startswith('CHG-AI-'):
            # Get target systems from AI assessment
            ai_assessment = change.get('ai_assessment', {})
            target_systems = ai_assessment.get('target_systems_analyzed', [])
            impacted_deps = ai_assessment.get('impacted_dependencies', [])
            
            # Count both target systems and impacted dependencies
            all_affected = target_systems + impacted_deps
            if all_affected:
                service_impact_counter.update(all_affected)
    
    top_5_services = dict(service_impact_counter.most_common(5))

    return {
        "kpis": {
            "total_incidents": total_incidents,
            "total_high_risk_changes": total_high_risk,
            "average_incident_downtime": avg_downtime,
            "average_revenue_impact": avg_revenue_impact,
            "ai_approval_rate": ai_approval_rate
        },
        "charts": {
            "change_risk_distribution": dict(risk_distribution),
            "top_5_impacted_services": top_5_services
        }
    }

@app.post("/api/approve_change/{change_id}")
async def approve_change(change_id: str):
    """Approve a change request and add to risk history."""
    for change in active_change_requests:
        if change.get('changeId') == change_id:
            change['status'] = "Approved"
            change['recommendedAction'] = "Approved by Human"
            
            # Add to risk history
            history_entry = {
                'type': 'completed_change',
                'changeId': change_id,
                'title': change.get('title', 'Change Request'),
                'category': change.get('category', change.get('type', 'General')),
                'status': 'Approved',
                'riskLevel': change.get('riskLevel', 'UNKNOWN'),
                'riskScore': change.get('riskScore'),
                'submittedBy': change.get('submittedBy', 'Unknown'),
                'completedDate': datetime.now().strftime('%Y-%m-%d'),
                'completedTime': datetime.now().strftime('%H:%M:%S'),
                'decision': 'Approved',
                'summary': change.get('ai_assessment', {}).get('summary', 'No AI assessment available'),
                'scheduledTime': change.get('scheduledTime')
            }
            risk_history_items.insert(0, history_entry)  # Add to beginning (newest first)
            
            return {"status": "success"}
    
    raise HTTPException(status_code=404, detail="Change not found.")

@app.post("/api/reject_change/{change_id}")
async def reject_change(change_id: str, request: RejectRequest):
    """Reject a change request and add to risk history."""
    for change in active_change_requests:
        if change.get('changeId') == change_id:
            change['status'] = "Rejected"
            change['recommendedAction'] = "Rejected by Human"
            change['rejectionReason'] = request.reason
            change['feedbackType'] = request.feedbackType
            
            # Add to risk history
            history_entry = {
                'type': 'completed_change',
                'changeId': change_id,
                'title': change.get('title', 'Change Request'),
                'category': change.get('category', change.get('type', 'General')),
                'status': 'Rejected',
                'riskLevel': change.get('riskLevel', 'UNKNOWN'),
                'riskScore': change.get('riskScore'),
                'submittedBy': change.get('submittedBy', 'Unknown'),
                'completedDate': datetime.now().strftime('%Y-%m-%d'),
                'completedTime': datetime.now().strftime('%H:%M:%S'),
                'decision': 'Rejected',
                'rejectionReason': request.reason,
                'feedbackType': request.feedbackType,
                'summary': change.get('ai_assessment', {}).get('summary', 'No AI assessment available'),
                'scheduledTime': change.get('scheduledTime')
            }
            risk_history_items.insert(0, history_entry)  # Add to beginning (newest first)
            
            return {"status": "success"}
    
    raise HTTPException(status_code=404, detail="Change not found.")

@app.post("/api/assess_risk")
async def assess_risk(request: ChangeRequest):
    """Assess the risk of a change request using AI."""
    if not ai_risk_agent:
        raise HTTPException(status_code=500, detail="AI Agent not initialized.")
    
    try:
        # Build the agent query
        agent_query = f"""
        Assess the IT change described below for overall risk.
        You have access to tools to assess technical risk, analyze service dependencies, and business impact.

        **Change Details:**
        - Type: {request.change_type}
        - Priority: {request.priority}
        - Target Systems: {', '.join(request.target_systems)}
        - Proposed Deployment Date & Time: {request.proposed_datetime}
        - Documentation/Notes: {request.documentation_notes}

        Your final output MUST be a single, valid JSON object and nothing else. Do not include any explanatory text, markdown formatting, or anything before or after the opening `{{` and closing `}}`.
        The JSON object should have the following structure:
        {{
          "summary": "A concise 2-4 sentence risk summary.",
          "recommendations": ["Recommendation 1 as a string.", "Recommendation 2 as a string.", "Always include a detailed rollback strategy."],
          "confidence": <an integer between 1 and 10>,
          "critique": "A brief critique of the assessment, mentioning data gaps or assumptions."
        }}
        """
        
        agent_result_object = ai_risk_agent(agent_query)
        raw_response_text = agent_result_object.message['content'][0].get('text', '') if isinstance(agent_result_object.message, dict) else str(agent_result_object.message)
        print(f"\n--- Strands Agent Raw Response ---\n{raw_response_text}\n-----------------------------------\n")
        
        parsed_json = json.loads(raw_response_text)
        summary_part = parsed_json.get("summary", "AI summary unavailable.")
        parsed_recommendations = parsed_json.get("recommendations", [])
        confidence_score = parsed_json.get("confidence")
        critique_part = parsed_json.get("critique", "No critique provided.")

        technical_risk_output = tools.assess_technical_risk(
            request.change_type, 
            request.documentation_notes, 
            request.priority, 
            request.target_systems
        )
        dependency_analysis_output = tools.analyze_service_dependencies(request.target_systems)
        business_impact_output = tools.assess_business_impact(
            request.proposed_datetime, 
            dependency_analysis_output.get('all_involved_services', [])
        )

        technical_risk_score = technical_risk_output.get('technical_risk_score', 0)
        num_impacted_dependencies = len(dependency_analysis_output.get('impacted_dependencies', []))
        overall_business_risk_score = business_impact_output.get('overall_business_risk_score', 0)
        
        calculated_risk_value = (
            technical_risk_score * config.RISK_WEIGHTS['technical'] + 
            num_impacted_dependencies * config.RISK_WEIGHTS['dependency'] + 
            overall_business_risk_score * config.RISK_WEIGHTS['business']
        )
        
        priority = request.priority
        if priority in config.PRIORITY_ADJUSTMENTS:
            calculated_risk_value += config.PRIORITY_ADJUSTMENTS[priority]
        
        normalized_risk = max(1.0, min(10.0, calculated_risk_value / config.MAX_CALCULATED_RISK * 10.0))
        credit_score = round(max(1.0, min(10.0, 10.0 - normalized_risk + 1.0)), 1)
        risk_level = "HIGH" if credit_score <= 3.5 else "MEDIUM" if credit_score <= 7.0 else "LOW"
        
        new_change_id = f"CHG-AI-{int(datetime.now().timestamp())}"
        final_ai_assessment = {
            "changeId": new_change_id,
            "risk_score": credit_score,
            "risk_level": risk_level,
            "summary": summary_part,
            "recommendations": parsed_recommendations,
            "confidence": confidence_score,
            "critique": critique_part,
            "technical_summary": technical_risk_output.get('technical_summary', ''),
            "dependency_summary": dependency_analysis_output.get('dependency_summary', ''),
            "business_summary": business_impact_output.get('business_summary', ''),
            "target_systems_analyzed": dependency_analysis_output.get('target_systems_analyzed', []),
            "impacted_dependencies": dependency_analysis_output.get('impacted_dependencies', []),
            "business_impact_timeline": business_impact_output.get('business_impact_timeline', []),
            "scheduledTime": request.proposed_datetime,
            "raw_agent_scores": {
                "technical_risk_score": technical_risk_score,
                "dependency_impact_count": num_impacted_dependencies,
                "overall_business_risk_score": overall_business_risk_score
            }
        }
        
        active_change_requests.append({
            "changeId": new_change_id,
            "title": request.documentation_notes[:50] + "...",
            "type": request.change_type,
            "category": request.change_type,
            "submittedBy": "You (AI Assessed)",
            "priority": request.priority,
            "riskScore": credit_score,
            "riskLevel": risk_level,
            "status": "AI Assessed",
            "recommendedAction": "Review AI Analysis",
            "scheduledTime": request.proposed_datetime,
            "ai_assessment": final_ai_assessment
        })
        
        return {"status": "success", "ai_assessment": final_ai_assessment}
        
    except Exception as e:
        print(f"!!! An unexpected error occurred in assess_risk: {e} !!!")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"An internal error occurred: {str(e)}")

@app.post("/api/reassess_business_impact")
async def reassess_business_impact(request: ReassessBusinessImpact):
    """Reassess business impact for a different time."""
    business_impact_output = tools.assess_business_impact(
        request.proposed_datetime, 
        request.all_involved_services
    )
    return business_impact_output

@app.post("/api/suggest_postmortem")
async def suggest_postmortem(request: PostmortemRequest):
    """Suggest preventative measures for a past incident."""
    if not ai_risk_agent:
        raise HTTPException(status_code=500, detail="AI Agent not initialized.")
    
    agent_query = f"""
    Analyze the following past IT incident and suggest 3 concrete, actionable preventative measures.
    **Incident Details:** - Title: "{request.title}" - Stated Root Cause: "{request.root_cause}"
    Your final output MUST be a single, valid JSON object with a single key "preventative_measures", which is a list of strings.
    """
    
    try:
        agent_result_object = ai_risk_agent(agent_query)
        raw_response_text = agent_result_object.message['content'][0].get('text', '') if isinstance(agent_result_object.message, dict) else str(agent_result_object.message)
        print(f"\n--- Post-Mortem Agent Raw Response ---\n{raw_response_text}\n-----------------------------------\n")
        return json.loads(raw_response_text)
    except Exception as e:
        print(f"Error in postmortem suggestion: {e}")
        return {"preventative_measures": ["AI analysis failed. Please review manually."]}

@app.post("/api/send_email_notification")
async def send_email_notification(request: EmailNotificationRequest):
    """Send email notification for a high-risk change"""
    try:
        # Find the change request
        change = next((c for c in active_change_requests if c.get('changeId') == request.change_id), None)
        
        if not change:
            print(f"ERROR: Change {request.change_id} not found")
            raise HTTPException(status_code=404, detail="Change request not found")
        
        # Check if change has AI assessment
        ai_assessment = change.get('ai_assessment')
        if not ai_assessment:
            print(f"ERROR: Change {request.change_id} has no AI assessment")
            print(f"DEBUG: Change keys: {list(change.keys())}")
            raise HTTPException(
                status_code=400,
                detail=f"Change {request.change_id} has no AI assessment. Only AI-assessed changes can have email notifications sent."
            )
        
        print(f"DEBUG: Sending email for change {request.change_id} to {request.recipient_email}")
        
        # Send email notification
        success = await email_service.send_high_risk_notification(
            recipient_email=request.recipient_email,
            assessment=ai_assessment,
            change_details=change
        )
        
        if success:
            print(f"DEBUG: Email sent successfully to {request.recipient_email}")
            return {
                "status": "success",
                "message": f"Email notification sent to {request.recipient_email}"
            }
        else:
            print(f"ERROR: Email service returned failure")
            raise HTTPException(
                status_code=500,
                detail="Failed to send email. Check server logs and email configuration."
            )
            
    except HTTPException:
        raise
    except Exception as e:
        print(f"ERROR: Exception in send_email_notification: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

