import { useState, useEffect, useRef } from 'react';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, Title } from 'chart.js';
import { Doughnut, Bar } from 'react-chartjs-2';
import { Network } from 'vis-network';
import * as api from './services/api';

// Register ChartJS components
ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, Title);

function App() {
  // State management
  const [activeSection, setActiveSection] = useState('changeOverview');
  const [username, setUsername] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [emailOnHighRisk, setEmailOnHighRisk] = useState(false);
  const [emailOnApproval, setEmailOnApproval] = useState(false);
  const [changeOverviewData, setChangeOverviewData] = useState([]);
  const [pendingApprovalsData, setPendingApprovalsData] = useState([]);
  const [riskHistoryData, setRiskHistoryData] = useState([]);
  const [analyticsData, setAnalyticsData] = useState(null);
  const [currentAssessment, setCurrentAssessment] = useState(null);
  const [toolsData, setToolsData] = useState({});
  const [alerts, setAlerts] = useState([]);
  const [notificationCount, setNotificationCount] = useState(0);
  
  // Modal states
  const [showSubmissionModal, setShowSubmissionModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [showPostmortemModal, setShowPostmortemModal] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [showIncidentDetailModal, setShowIncidentDetailModal] = useState(false);
  const [pendingChangeToReject, setPendingChangeToReject] = useState(null);
  const [pendingChangeForEmail, setPendingChangeForEmail] = useState(null);
  const [postmortemData, setPostmortemData] = useState(null);
  const [postmortemSuggestions, setPostmortemSuggestions] = useState([]);
  const [postmortemLoading, setPostmortemLoading] = useState(false);
  const [emailSending, setEmailSending] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState('');
  const [selectedIncident, setSelectedIncident] = useState(null);
  
  // Form states
  const [changeForm, setChangeForm] = useState({
    change_type: '',
    priority: '',
    target_systems: '',
    proposed_date: '',
    deployment_time: '',
    documentation_notes: ''
  });
  const [rejectForm, setRejectForm] = useState({ reason: '', feedbackType: 'none' });
  const [submitting, setSubmitting] = useState(false);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  
  // Refs for network graph
  const networkRef = useRef(null);
  const networkInstance = useRef(null);

  // Load settings from localStorage
  useEffect(() => {
    const settings = JSON.parse(localStorage.getItem('aiRiskRadarSettings')) || {};
    setUsername(settings.username || 'Guest');
    setUserEmail(settings.userEmail || '');
    setEmailOnHighRisk(settings.emailOnHighRisk || false);
    setEmailOnApproval(settings.emailOnApproval || false);
  }, []);

  // Fetch initial data
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const tools = await api.fetchToolsData();
        setToolsData(tools);
      } catch (error) {
        console.error('Error fetching initial data:', error);
      }
    };
    fetchInitialData();
  }, []);

  // Fetch data based on active section
  useEffect(() => {
    const fetchData = async () => {
      try {
        if (activeSection === 'changeOverview') {
          const data = await api.fetchChangeOverview();
          setChangeOverviewData(data);
        } else if (activeSection === 'pendingApprovals') {
          const data = await api.fetchPendingApprovals();
          setPendingApprovalsData(data);
        } else if (activeSection === 'riskHistory') {
          const data = await api.fetchRiskHistory();
          setRiskHistoryData(data);
        } else if (activeSection === 'reports') {
          const data = await api.fetchAnalytics();
          setAnalyticsData(data);
        }
      } catch (error) {
        console.error('Error fetching section data:', error);
        displayAlert(`Failed to load data: ${error.message}`, 'error');
      }
    };
    fetchData();
  }, [activeSection]);

  // Display alert function
  const displayAlert = (message, type = 'info') => {
    const newAlert = { id: Date.now(), message, type };
    setAlerts(prev => [...prev, newAlert]);
    setNotificationCount(prev => prev + 1);
    setTimeout(() => {
      setAlerts(prev => prev.filter(a => a.id !== newAlert.id));
      setNotificationCount(prev => Math.max(0, prev - 1));
    }, 7000);
  };

  // Handle settings save
  const handleSettingsSave = (e) => {
    e.preventDefault();
    const settings = { username, userEmail, emailOnHighRisk, emailOnApproval };
    localStorage.setItem('aiRiskRadarSettings', JSON.stringify(settings));
    displayAlert('Settings saved successfully!', 'success');
  };

  // Handle change approval
  const handleApproval = async (changeId) => {
    try {
      await api.approveChange(changeId);
      displayAlert(`Change ${changeId} approved successfully!`, 'success');
      setPendingApprovalsData(prev => prev.filter(c => c.changeId !== changeId));
      const data = await api.fetchChangeOverview();
      setChangeOverviewData(data);
    } catch (error) {
      displayAlert(`Failed to approve change: ${error.message}`, 'error');
    }
  };

  // Handle change rejection
  const handleRejectSubmit = async (e) => {
    e.preventDefault();
    if (!pendingChangeToReject) return;
    
    try {
      await api.rejectChange(pendingChangeToReject, rejectForm);
      displayAlert(`Change ${pendingChangeToReject} rejected.`, 'warning');
      setShowRejectModal(false);
      setRejectForm({ reason: '', feedbackType: 'none' });
      setPendingChangeToReject(null);
      const data = await api.fetchPendingApprovals();
      setPendingApprovalsData(data);
      const overviewData = await api.fetchChangeOverview();
      setChangeOverviewData(overviewData);
    } catch (error) {
      displayAlert(`Failed to reject change: ${error.message}`, 'error');
    }
  };

  // Handle change submission and risk assessment
  const handleChangeSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    
    const request = {
      change_type: changeForm.change_type,
      priority: changeForm.priority,
      target_systems: changeForm.target_systems.split(',').map(s => s.trim()).filter(Boolean),
      proposed_datetime: `${changeForm.proposed_date}T${changeForm.deployment_time}`,
      documentation_notes: changeForm.documentation_notes
    };

    if (request.target_systems.length === 0 || !request.change_type || !request.priority) {
      alert('Please fill all required fields.');
      setSubmitting(false);
      return;
    }

    setShowSubmissionModal(false);
    setAnalysisLoading(true);
    setActiveSection('riskAnalysis');

    try {
      const result = await api.assessRisk(request);
      setAnalysisLoading(false);
      setSubmitting(false);
      
      if (result && result.ai_assessment) {
        setCurrentAssessment(result.ai_assessment);
        const data = await api.fetchChangeOverview();
        setChangeOverviewData(data);
        
        if (result.ai_assessment.risk_level === 'HIGH' || result.ai_assessment.risk_level === 'CRITICAL') {
          displayAlert(`High Risk Change Detected: ${result.ai_assessment.summary}`, 'error');
        }
        if (result.ai_assessment.impacted_dependencies.length > 1) {
          displayAlert(`This change impacts ${result.ai_assessment.impacted_dependencies.length} downstream services.`, 'warning');
        }
      }
    } catch (error) {
      setAnalysisLoading(false);
      setSubmitting(false);
      displayAlert(`Risk assessment failed: ${error.message}`, 'error');
      setActiveSection('changeOverview');
    }
    
    setChangeForm({ change_type: '', priority: '', target_systems: '', proposed_date: '', deployment_time: '', documentation_notes: '' });
  };

  // Handle reassessment at night
  const handleReassessAtNight = async () => {
    if (!currentAssessment) return;
    
    const originalDate = currentAssessment.scheduledTime.split('T')[0];
    try {
      const result = await api.reassessBusinessImpact({
        proposed_datetime: `${originalDate}T03:00`,
        all_involved_services: [...currentAssessment.target_systems_analyzed, ...currentAssessment.impacted_dependencies]
      });
      
      setCurrentAssessment(prev => ({
        ...prev,
        business_impact_timeline: result.business_impact_timeline,
        business_summary: result.business_summary
      }));
      
      displayAlert(`Re-assessed for 3 AM. Business impact is now: ${result.business_impact_level}.`, 'success');
    } catch (error) {
      displayAlert(`Failed to reassess: ${error.message}`, 'error');
    }
  };

  // Handle postmortem modal
  const handlePostmortemClick = async (incident) => {
    setPostmortemData(incident);
    setPostmortemSuggestions([]);
    setPostmortemLoading(true);
    setShowPostmortemModal(true);
    
    try {
      const result = await api.suggestPostmortem({
        title: incident.title,
        root_cause: incident.rootCause
      });
      setPostmortemLoading(false);
      setPostmortemSuggestions(result.preventative_measures || []);
    } catch (error) {
      setPostmortemLoading(false);
      setPostmortemSuggestions(['AI analysis failed. Please review manually.']);
    }
  };

  // Handle email notification
  const handleSendEmail = async (e) => {
    e.preventDefault();
    if (!pendingChangeForEmail || !recipientEmail) return;
    
    setEmailSending(true);
    try {
      await api.sendEmailNotification({
        change_id: pendingChangeForEmail,
        recipient_email: recipientEmail
      });
      displayAlert(`Email notification sent successfully to ${recipientEmail}!`, 'success');
      setShowEmailModal(false);
      setRecipientEmail('');
      setPendingChangeForEmail(null);
    } catch (error) {
      console.error('Email send error:', error);
      const errorMsg = error.response?.data?.detail || error.message || 'Unknown error occurred';
      displayAlert(`Failed to send email: ${errorMsg}`, 'error');
    } finally {
      setEmailSending(false);
    }
  };

  // Render dependency graph
  useEffect(() => {
    if (activeSection === 'riskAnalysis' && currentAssessment && networkRef.current) {
      renderDependencyGraph();
    }
  }, [currentAssessment, activeSection]);

  const renderDependencyGraph = () => {
    if (!networkRef.current || !currentAssessment) return;
    
    const nodes = [];
    const edges = [];
    
    currentAssessment.target_systems_analyzed?.forEach(sys => {
      nodes.push({ id: sys, label: sys, color: '#3b82f6', font: { color: 'white' } });
    });
    
    currentAssessment.impacted_dependencies?.forEach(dep => {
      nodes.push({ id: dep, label: dep, color: '#f59e0b', font: { color: 'white' } });
    });
    
    currentAssessment.target_systems_analyzed?.forEach(target => {
      const deps = toolsData.SERVICE_DEPENDENCIES_GRAPH?.[target] || [];
      deps.forEach(dep => {
        if (nodes.some(n => n.id === dep)) {
          edges.push({ from: target, to: dep, arrows: 'to' });
        }
      });
    });

    if (networkInstance.current) {
      networkInstance.current.destroy();
    }

    networkInstance.current = new Network(
      networkRef.current,
      { nodes, edges },
      {
        layout: { hierarchical: false },
        interaction: { hover: true },
        nodes: { shape: 'box', margin: 10 },
        edges: { color: { color: '#94a3b8' } }
      }
    );

    networkInstance.current.on('click', (params) => {
      if (params.nodes.length > 0) {
        const clickedNodeId = params.nodes[0];
        const service = toolsData.GUARDIANOPS_DATASET?.serviceDependencies?.find(s => s.serviceName === clickedNodeId);
        if (service) {
          alert(`Service: ${service.serviceName}\nCriticality: ${service.criticalityScore}/100\nAvg Reqs/Min: ${service.avgRequestsPerMin}`);
        }
      }
    });
  };

  // Open submission modal
  const openSubmissionModal = () => {
    setShowSubmissionModal(true);
    const today = new Date();
    const localISO = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString();
    setChangeForm(prev => ({
      ...prev,
      proposed_date: localISO.slice(0, 10),
      deployment_time: localISO.slice(11, 16)
    }));
  };

  // Render chart data
  const getRiskDistributionChartData = () => {
    if (!analyticsData) return null;
    const data = analyticsData.charts.change_risk_distribution;
    const riskColors = { 'Critical': '#ef4444', 'High': '#f97316', 'Medium': '#facc15', 'Low': '#4ade80' };
    
    return {
      labels: Object.keys(data),
      datasets: [{
        label: 'Risk Distribution',
        data: Object.values(data),
        backgroundColor: Object.keys(data).map(l => riskColors[l] || '#9ca3af'),
        borderColor: '#ffffff',
        borderWidth: 2
      }]
    };
  };

  const getTopServicesChartData = () => {
    if (!analyticsData) return null;
    const data = analyticsData.charts.top_5_impacted_services;
    
    return {
      labels: Object.keys(data),
      datasets: [{
        label: 'Times Impacted in Failures',
        data: Object.values(data),
        backgroundColor: 'rgba(59, 130, 246, 0.5)',
        borderColor: '#3b82f6',
        borderWidth: 1
      }]
    };
  };

  return (
    <div className="dashboard">
      {/* Header */}
      <div className="header">
        <div className="logo">
          <i className="fas fa-microchip"></i> AI Risk Radar -Intelligent Deployment System
        </div>
        <div className="header-right">
          <span style={{fontWeight: 500}}>{username}</span>
          <button className="icon-btn" title="Notifications">
            <i className="fas fa-bell"></i>
            {notificationCount > 0 && <span className="notification-badge">{notificationCount}</span>}
          </button>
        </div>
      </div>

      {/* Sidebar */}
      <div className="sidebar">
        <div className="sidebar-item" onClick={openSubmissionModal}>
          <i className="fas fa-plus-circle"></i> Submit New Change
        </div>
        <div className={`sidebar-item ${activeSection === 'changeOverview' ? 'active' : ''}`} onClick={() => setActiveSection('changeOverview')}>
          <i className="fas fa-list-alt"></i> Change Overview
        </div>
        <div className={`sidebar-item ${activeSection === 'pendingApprovals' ? 'active' : ''}`} onClick={() => setActiveSection('pendingApprovals')}>
          <i className="fas fa-clock"></i> Pending Approvals
        </div>
        <div className={`sidebar-item ${activeSection === 'riskHistory' ? 'active' : ''}`} onClick={() => setActiveSection('riskHistory')}>
          <i className="fas fa-history"></i> Risk History
        </div>
        <div className={`sidebar-item ${activeSection === 'reports' ? 'active' : ''}`} onClick={() => setActiveSection('reports')}>
          <i className="fas fa-chart-line"></i> Reports & Analytics
        </div>
        <div className={`sidebar-item ${activeSection === 'settings' ? 'active' : ''}`} onClick={() => setActiveSection('settings')}>
          <i className="fas fa-cog"></i> Settings
        </div>
      </div>

      {/* Main Content */}
      <div className="main-content">
        {/* Change Overview Section */}
        {activeSection === 'changeOverview' && (
          <div className="section">
            <div className="section-header">
              <i className="fas fa-list-alt"></i> Change Request Overview
            </div>
            <div className="section-content">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Change ID</th>
                    <th>Type</th>
                    <th>Submitted By</th>
                    <th>Risk Score</th>
                    <th>Status</th>
                    <th>Recommended Action</th>
                  </tr>
                </thead>
                <tbody>
                  {changeOverviewData.map((c) => (
                    <tr 
                      key={c.changeId} 
                      onClick={() => {
                        if (c.ai_assessment) {
                          setCurrentAssessment(c.ai_assessment);
                          setActiveSection('riskAnalysis');
                        }
                      }}
                      className={c.ai_assessment ? '' : 'no-hover'}
                    >
                      <td>{c.changeId}</td>
                      <td>{c.type || c.category}</td>
                      <td>{c.submittedBy}</td>
                      <td>
                        <span className={`tag tag-${(c.riskLevel || 'low').toLowerCase()}`}>
                          {(c.riskLevel || 'N/A').toUpperCase()} ({c.riskScore || 'N/A'})
                        </span>
                      </td>
                      <td>
                        <span className={`status-tag status-${(c.status || 'pending').toLowerCase().replace(' ', '-')}`}>
                          {c.status}
                        </span>
                      </td>
                      <td>{c.recommendedAction}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {changeOverviewData.length === 0 && (
                <p style={{textAlign: 'center', marginTop: '20px'}}>No changes found.</p>
              )}
            </div>
          </div>
        )}

        {/* Pending Approvals Section */}
        {activeSection === 'pendingApprovals' && (
          <div className="section">
            <div className="section-header">
              <i className="fas fa-clock"></i> Pending Approvals
            </div>
            <div className="section-content">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Change ID</th>
                    <th>Title</th>
                    <th>Submitted By</th>
                    <th>Priority</th>
                    <th>Risk Score</th>
                    <th>Scheduled Time</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingApprovalsData.map((item) => (
                    <tr key={item.changeId} className="no-hover">
                      <td>{item.changeId}</td>
                      <td>{item.title}</td>
                      <td>{item.submittedBy}</td>
                      <td>
                        <span className={`tag tag-${(item.priority || 'low').toLowerCase()}`}>
                          {item.priority}
                        </span>
                      </td>
                      <td>
                        <span className={`tag tag-${(item.riskLevel || 'low').toLowerCase()}`}>
                          {item.riskLevel.toUpperCase()} ({item.riskScore})
                        </span>
                      </td>
                      <td>{new Date(item.scheduledTime).toLocaleString()}</td>
                      <td>
                        <div style={{display: 'flex', gap: '8px', flexWrap: 'wrap'}}>
                          <button className="btn btn-primary" onClick={() => handleApproval(item.changeId)}>
                            Approve
                          </button>
                          <button className="btn btn-danger" onClick={() => {
                            setPendingChangeToReject(item.changeId);
                            setShowRejectModal(true);
                          }}>
                            Reject
                          </button>
                          <button
                            className="btn"
                            style={{background: '#8b5cf6', color: 'white'}}
                            onClick={() => {
                              setPendingChangeForEmail(item.changeId);
                              setShowEmailModal(true);
                            }}
                            title="Send email notification to business stakeholders"
                          >
                            <i className="fas fa-envelope"></i> Email
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {pendingApprovalsData.length === 0 && (
                <p style={{textAlign: 'center', marginTop: '20px'}}>No pending approvals.</p>
              )}
            </div>
          </div>
        )}

        {/* Risk History Section */}
        {activeSection === 'riskHistory' && (
          <div className="section">
            <div className="section-header">
              <i className="fas fa-history"></i> Past Incidents & Business Impact Analysis
            </div>
            <div className="section-content">
              {/* Summary Stats Banner */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '16px',
                marginBottom: '24px'
              }}>
                <div style={{
                  padding: '16px',
                  background: 'linear-gradient(135deg, #fef2f2 0%, #fff 100%)',
                  borderRadius: '12px',
                  border: '2px solid #fecaca',
                  textAlign: 'center'
                }}>
                  <div style={{fontSize: '2rem', fontWeight: '700', color: '#dc2626'}}>
                    {riskHistoryData.length}
                  </div>
                  <div style={{fontSize: '0.85rem', color: '#991b1b', fontWeight: '600', marginTop: '4px'}}>
                    Total Incidents
                  </div>
                </div>
                <div style={{
                  padding: '16px',
                  background: 'linear-gradient(135deg, #fffbeb 0%, #fff 100%)',
                  borderRadius: '12px',
                  border: '2px solid #fcd34d',
                  textAlign: 'center'
                }}>
                  <div style={{fontSize: '2rem', fontWeight: '700', color: '#d97706'}}>
                    {riskHistoryData.reduce((sum, item) => {
                      const hours = parseFloat(item.downtime?.match(/[\d.]+/)?.[0] || 0);
                      return sum + hours;
                    }, 0).toFixed(1)}h
                  </div>
                  <div style={{fontSize: '0.85rem', color: '#92400e', fontWeight: '600', marginTop: '4px'}}>
                    Total Downtime
                  </div>
                </div>
                <div style={{
                  padding: '16px',
                  background: 'linear-gradient(135deg, #fef2f2 0%, #fff 100%)',
                  borderRadius: '12px',
                  border: '2px solid #fca5a5',
                  textAlign: 'center'
                }}>
                  <div style={{fontSize: '2rem', fontWeight: '700', color: '#dc2626'}}>
                    ${(riskHistoryData.reduce((sum, item) => {
                      const amount = parseInt(item.revenue_impact?.replace(/[$,]/g, '') || 0);
                      return sum + amount;
                    }, 0) / 1000).toFixed(0)}K
                  </div>
                  <div style={{fontSize: '0.85rem', color: '#991b1b', fontWeight: '600', marginTop: '4px'}}>
                    Revenue Lost
                  </div>
                </div>
                <div style={{
                  padding: '16px',
                  background: 'linear-gradient(135deg, #eff6ff 0%, #fff 100%)',
                  borderRadius: '12px',
                  border: '2px solid #93c5fd',
                  textAlign: 'center'
                }}>
                  <div style={{fontSize: '2rem', fontWeight: '700', color: '#2563eb'}}>
                    {riskHistoryData.filter(item => item.slaBreached).length}
                  </div>
                  <div style={{fontSize: '0.85rem', color: '#1e40af', fontWeight: '600', marginTop: '4px'}}>
                    SLA Breaches
                  </div>
                </div>
              </div>

              <div style={{marginBottom: '24px', padding: '16px', background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)', borderRadius: '12px', border: '1px solid #93c5fd'}}>
                <p style={{color: '#1e40af', fontSize: '0.95rem', lineHeight: '1.6', margin: 0}}>
                  <i className="fas fa-lightbulb" style={{marginRight: '8px'}}></i>
                  <strong>Pro Tip:</strong> Click on any incident card below to get AI-powered preventative recommendations and learn from past mistakes
                </p>
              </div>

              {riskHistoryData.length === 0 ? (
                <p style={{textAlign: 'center', marginTop: '40px', fontSize: '1.1rem', color: '#64748b'}}>
                  <i className="fas fa-check-circle" style={{color: '#22c55e', fontSize: '2rem', display: 'block', marginBottom: '12px'}}></i>
                  No historical incidents found
                </p>
              ) : (
                <div style={{display: 'grid', gap: '16px'}}>
                  {riskHistoryData.map((item) => {
                    const isIncident = item.type === 'incident';
                    const isCompleted = item.type === 'completed_change';
                    
                    return (
                    <div
                      key={item.incidentId || item.changeId}
                      onClick={() => {
                        setSelectedIncident(item);
                        setShowIncidentDetailModal(true);
                      }}
                      style={{
                        background: 'white',
                        border: `2px solid ${isCompleted ? (item.decision === 'Approved' ? '#d1fae5' : '#fee2e2') : '#e2e8f0'}`,
                        borderRadius: '16px',
                        padding: '24px',
                        cursor: 'pointer',
                        transition: 'all 0.3s ease',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
                        position: 'relative'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = '#3b82f6';
                        e.currentTarget.style.boxShadow = '0 12px 32px rgba(59, 130, 246, 0.2)';
                        e.currentTarget.style.transform = 'translateY(-4px)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = isCompleted ? (item.decision === 'Approved' ? '#d1fae5' : '#fee2e2') : '#e2e8f0';
                        e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.05)';
                        e.currentTarget.style.transform = 'translateY(0)';
                      }}
                    >
                      {/* Type Badge */}
                      {isCompleted && (
                        <div style={{
                          position: 'absolute',
                          top: '16px',
                          right: '16px',
                          padding: '6px 12px',
                          borderRadius: '20px',
                          fontSize: '0.75rem',
                          fontWeight: '700',
                          background: item.decision === 'Approved' ? 'linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)' : 'linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)',
                          color: item.decision === 'Approved' ? '#065f46' : '#991b1b',
                          border: `1px solid ${item.decision === 'Approved' ? '#86efac' : '#fca5a5'}`,
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}>
                          <i className={`fas ${item.decision === 'Approved' ? 'fa-check-circle' : 'fa-times-circle'}`}></i>
                          {item.decision}
                        </div>
                      )}
                      {/* Header Section */}
                      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px', paddingRight: isCompleted ? '120px' : '0'}}>
                        <div style={{flex: 1}}>
                          <h4 style={{fontSize: '1.15rem', fontWeight: '700', color: '#1e293b', marginBottom: '8px', lineHeight: '1.4'}}>
                            <i className={`fas ${isIncident ? 'fa-exclamation-triangle' : 'fa-exchange-alt'}`} style={{color: isIncident ? '#ef4444' : '#3b82f6', marginRight: '10px'}}></i>
                            {item.title || 'Untitled Item'}
                          </h4>
                          <div style={{display: 'flex', flexWrap: 'wrap', gap: '12px', fontSize: '0.85rem', color: '#64748b'}}>
                            <span style={{display: 'flex', alignItems: 'center', gap: '4px'}}>
                              <i className="fas fa-calendar-alt"></i>
                              {item.date || item.completedDate || 'N/A'}
                            </span>
                            {item.completedTime && (
                              <span style={{display: 'flex', alignItems: 'center', gap: '4px'}}>
                                <i className="fas fa-clock"></i>
                                {item.completedTime}
                              </span>
                            )}
                            <span style={{display: 'flex', alignItems: 'center', gap: '4px'}}>
                              <i className="fas fa-hashtag"></i>
                              {item.incidentId || item.changeId || 'N/A'}
                            </span>
                            {item.submittedBy && (
                              <span style={{display: 'flex', alignItems: 'center', gap: '4px'}}>
                                <i className="fas fa-user"></i>
                                {item.submittedBy}
                              </span>
                            )}
                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              background: item.category === 'Database' ? '#dbeafe' :
                                         item.category === 'Security' ? '#fef3c7' :
                                         item.category === 'Infrastructure' ? '#fce7f3' : '#f3f4f6',
                              color: item.category === 'Database' ? '#1e40af' :
                                     item.category === 'Security' ? '#92400e' :
                                     item.category === 'Infrastructure' ? '#9f1239' : '#374151',
                              fontWeight: '600'
                            }}>
                              <i className="fas fa-tag"></i>
                              {item.category || 'General'}
                            </span>
                          </div>
                        </div>
                        <div style={{display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-end'}}>
                          <span className={`tag tag-${(item.riskLevel || 'low').toLowerCase()}`} style={{marginLeft: '12px'}}>
                            {(item.riskLevel || 'N/A').toUpperCase()}
                          </span>
                          {item.slaBreached && (
                            <span style={{
                              padding: '4px 10px',
                              background: '#fee2e2',
                              color: '#991b1b',
                              borderRadius: '6px',
                              fontSize: '0.75rem',
                              fontWeight: '700',
                              border: '1px solid #fca5a5'
                            }}>
                              <i className="fas fa-ban" style={{marginRight: '4px'}}></i>
                              SLA BREACH
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Impact Metrics Grid - Only for incidents */}
                      {isIncident && (
                      <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '16px'}}>
                        <div style={{padding: '14px', background: 'linear-gradient(135deg, #fef2f2 0%, #fff 100%)', borderRadius: '10px', border: '2px solid #fecaca'}}>
                          <div style={{fontSize: '0.7rem', color: '#991b1b', fontWeight: '700', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px'}}>
                            <i className="fas fa-clock" style={{marginRight: '4px'}}></i>
                            Downtime
                          </div>
                          <div style={{fontSize: '1.6rem', fontWeight: '800', color: '#dc2626', lineHeight: '1'}}>
                            {item.downtime || 'N/A'}
                          </div>
                        </div>
                        <div style={{padding: '14px', background: 'linear-gradient(135deg, #fef2f2 0%, #fff 100%)', borderRadius: '10px', border: '2px solid #fecaca'}}>
                          <div style={{fontSize: '0.7rem', color: '#991b1b', fontWeight: '700', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px'}}>
                            <i className="fas fa-dollar-sign" style={{marginRight: '4px'}}></i>
                            Revenue Impact
                          </div>
                          <div style={{fontSize: '1.6rem', fontWeight: '800', color: '#dc2626', lineHeight: '1'}}>
                            {item.revenue_impact || 'N/A'}
                          </div>
                        </div>
                        <div style={{padding: '14px', background: 'linear-gradient(135deg, #fffbeb 0%, #fff 100%)', borderRadius: '10px', border: '2px solid #fcd34d'}}>
                          <div style={{fontSize: '0.7rem', color: '#92400e', fontWeight: '700', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px'}}>
                            <i className="fas fa-users" style={{marginRight: '4px'}}></i>
                            Affected Users
                          </div>
                          <div style={{fontSize: '1.6rem', fontWeight: '800', color: '#d97706', lineHeight: '1'}}>
                            {item.affectedUsers?.toLocaleString() || 'N/A'}
                          </div>
                        </div>
                        <div style={{padding: '14px', background: 'linear-gradient(135deg, #eff6ff 0%, #fff 100%)', borderRadius: '10px', border: '2px solid #93c5fd'}}>
                          <div style={{fontSize: '0.7rem', color: '#1e40af', fontWeight: '700', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px'}}>
                            <i className="fas fa-undo" style={{marginRight: '4px'}}></i>
                            Rollback Time
                          </div>
                          <div style={{fontSize: '1.6rem', fontWeight: '800', color: '#2563eb', lineHeight: '1'}}>
                            {item.rollbackTime || 'N/A'}
                          </div>
                        </div>
                      </div>
                      )}

                      {/* Summary Section */}
                      <div style={{padding: '14px', background: '#f8fafc', borderRadius: '10px', borderLeft: `4px solid ${isIncident ? '#3b82f6' : (item.decision === 'Approved' ? '#22c55e' : '#ef4444')}`, marginBottom: '12px'}}>
                        <div style={{fontSize: '0.75rem', color: '#64748b', fontWeight: '700', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px'}}>
                          <i className={`fas ${isIncident ? 'fa-search' : 'fa-file-alt'}`} style={{marginRight: '6px'}}></i>
                          {isIncident ? 'Root Cause Analysis' : 'Risk Analysis Summary'}
                        </div>
                        <div style={{fontSize: '0.95rem', color: '#334155', lineHeight: '1.6', fontWeight: '500'}}>
                          {isIncident ? (item.rootCause || 'Root cause analysis pending...') : (item.summary || 'No summary available')}
                        </div>
                      </div>

                      {/* Rejection Reason for rejected changes */}
                      {isCompleted && item.decision === 'Rejected' && item.rejectionReason && (
                        <div style={{padding: '14px', background: '#fef2f2', borderRadius: '10px', borderLeft: '4px solid #ef4444', marginBottom: '12px'}}>
                          <div style={{fontSize: '0.75rem', color: '#991b1b', fontWeight: '700', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px'}}>
                            <i className="fas fa-ban" style={{marginRight: '6px'}}></i>
                            Rejection Reason
                          </div>
                          <div style={{fontSize: '0.95rem', color: '#991b1b', lineHeight: '1.6', fontWeight: '500'}}>
                            {item.rejectionReason}
                          </div>
                        </div>
                      )}

                      {/* Action CTA */}
                      <div style={{
                        marginTop: '16px',
                        padding: '12px 16px',
                        background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
                        borderRadius: '8px',
                        fontSize: '0.9rem',
                        color: '#1e40af',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '10px',
                        fontWeight: '600',
                        border: '1px solid #93c5fd'
                      }}>
                        <i className="fas fa-info-circle" style={{fontSize: '1.1rem'}}></i>
                        Click to View Complete Details
                        <i className="fas fa-arrow-right"></i>
                      </div>
                    </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Risk Analysis Section */}
        {activeSection === 'riskAnalysis' && (
          <div className="section">
            <div className="section-header">
              <span>{currentAssessment ? `🎯 Risk Analysis - ${currentAssessment.changeId} (${currentAssessment.risk_level} Risk)` : '🎯 Risk Analysis'}</span>
            </div>
            <div className="section-content">
              {analysisLoading && (
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minHeight: '500px',
                  padding: '40px'
                }}>
                  {/* Main Spinner */}
                  <div style={{
                    width: '120px',
                    height: '120px',
                    border: '8px solid #e0e7ff',
                    borderTop: '8px solid #3b82f6',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite',
                    marginBottom: '30px',
                    boxShadow: '0 4px 20px rgba(59, 130, 246, 0.2)'
                  }}></div>

                  {/* Analyzing Title */}
                  <h2 style={{
                    fontSize: '1.8rem',
                    fontWeight: '700',
                    color: '#1e293b',
                    marginBottom: '20px',
                    animation: 'pulse 2s ease-in-out infinite'
                  }}>
                    <i className="fas fa-brain" style={{marginRight: '12px', color: '#3b82f6'}}></i>
                    AI Risk Analysis in Progress
                  </h2>

                  {/* Analysis Steps */}
                  <div style={{
                    width: '100%',
                    maxWidth: '600px',
                    background: 'white',
                    borderRadius: '16px',
                    padding: '24px',
                    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.08)',
                    marginTop: '20px'
                  }}>
                    <div style={{marginBottom: '20px'}}>
                      <div style={{display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px'}}>
                        <div style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '50%',
                          background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          animation: 'bounce 1s ease-in-out infinite'
                        }}>
                          <i className="fas fa-microchip" style={{color: 'white', fontSize: '0.9rem'}}></i>
                        </div>
                        <div style={{flex: 1}}>
                          <div style={{fontWeight: '600', color: '#1e293b', marginBottom: '4px'}}>
                            Analyzing Technical Risk
                          </div>
                          <div style={{fontSize: '0.85rem', color: '#64748b'}}>
                            Evaluating complexity, dependencies, and historical data...
                          </div>
                        </div>
                        <div style={{display: 'flex', gap: '4px'}}>
                          <span style={{
                            width: '6px',
                            height: '6px',
                            borderRadius: '50%',
                            background: '#3b82f6',
                            animation: 'blink 1.4s ease-in-out infinite'
                          }}></span>
                          <span style={{
                            width: '6px',
                            height: '6px',
                            borderRadius: '50%',
                            background: '#3b82f6',
                            animation: 'blink 1.4s ease-in-out 0.2s infinite'
                          }}></span>
                          <span style={{
                            width: '6px',
                            height: '6px',
                            borderRadius: '50%',
                            background: '#3b82f6',
                            animation: 'blink 1.4s ease-in-out 0.4s infinite'
                          }}></span>
                        </div>
                      </div>
                    </div>

                    <div style={{marginBottom: '20px'}}>
                      <div style={{display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px'}}>
                        <div style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '50%',
                          background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          animation: 'bounce 1s ease-in-out 0.2s infinite'
                        }}>
                          <i className="fas fa-project-diagram" style={{color: 'white', fontSize: '0.9rem'}}></i>
                        </div>
                        <div style={{flex: 1}}>
                          <div style={{fontWeight: '600', color: '#1e293b', marginBottom: '4px'}}>
                            Mapping Service Dependencies
                          </div>
                          <div style={{fontSize: '0.85rem', color: '#64748b'}}>
                            Identifying downstream impacts and critical services...
                          </div>
                        </div>
                        <div style={{display: 'flex', gap: '4px'}}>
                          <span style={{
                            width: '6px',
                            height: '6px',
                            borderRadius: '50%',
                            background: '#8b5cf6',
                            animation: 'blink 1.4s ease-in-out infinite'
                          }}></span>
                          <span style={{
                            width: '6px',
                            height: '6px',
                            borderRadius: '50%',
                            background: '#8b5cf6',
                            animation: 'blink 1.4s ease-in-out 0.2s infinite'
                          }}></span>
                          <span style={{
                            width: '6px',
                            height: '6px',
                            borderRadius: '50%',
                            background: '#8b5cf6',
                            animation: 'blink 1.4s ease-in-out 0.4s infinite'
                          }}></span>
                        </div>
                      </div>
                    </div>

                    <div style={{marginBottom: '20px'}}>
                      <div style={{display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px'}}>
                        <div style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '50%',
                          background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          animation: 'bounce 1s ease-in-out 0.4s infinite'
                        }}>
                          <i className="fas fa-business-time" style={{color: 'white', fontSize: '0.9rem'}}></i>
                        </div>
                        <div style={{flex: 1}}>
                          <div style={{fontWeight: '600', color: '#1e293b', marginBottom: '4px'}}>
                            Assessing Business Impact
                          </div>
                          <div style={{fontSize: '0.85rem', color: '#64748b'}}>
                            Checking business calendar and optimal timing...
                          </div>
                        </div>
                        <div style={{display: 'flex', gap: '4px'}}>
                          <span style={{
                            width: '6px',
                            height: '6px',
                            borderRadius: '50%',
                            background: '#f59e0b',
                            animation: 'blink 1.4s ease-in-out infinite'
                          }}></span>
                          <span style={{
                            width: '6px',
                            height: '6px',
                            borderRadius: '50%',
                            background: '#f59e0b',
                            animation: 'blink 1.4s ease-in-out 0.2s infinite'
                          }}></span>
                          <span style={{
                            width: '6px',
                            height: '6px',
                            borderRadius: '50%',
                            background: '#f59e0b',
                            animation: 'blink 1.4s ease-in-out 0.4s infinite'
                          }}></span>
                        </div>
                      </div>
                    </div>

                    <div>
                      <div style={{display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px'}}>
                        <div style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '50%',
                          background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          animation: 'bounce 1s ease-in-out 0.6s infinite'
                        }}>
                          <i className="fas fa-lightbulb" style={{color: 'white', fontSize: '0.9rem'}}></i>
                        </div>
                        <div style={{flex: 1}}>
                          <div style={{fontWeight: '600', color: '#1e293b', marginBottom: '4px'}}>
                            Generating Recommendations
                          </div>
                          <div style={{fontSize: '0.85rem', color: '#64748b'}}>
                            Creating actionable insights and best practices...
                          </div>
                        </div>
                        <div style={{display: 'flex', gap: '4px'}}>
                          <span style={{
                            width: '6px',
                            height: '6px',
                            borderRadius: '50%',
                            background: '#22c55e',
                            animation: 'blink 1.4s ease-in-out infinite'
                          }}></span>
                          <span style={{
                            width: '6px',
                            height: '6px',
                            borderRadius: '50%',
                            background: '#22c55e',
                            animation: 'blink 1.4s ease-in-out 0.2s infinite'
                          }}></span>
                          <span style={{
                            width: '6px',
                            height: '6px',
                            borderRadius: '50%',
                            background: '#22c55e',
                            animation: 'blink 1.4s ease-in-out 0.4s infinite'
                          }}></span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Progress Message */}
                  <p style={{
                    marginTop: '30px',
                    fontSize: '0.95rem',
                    color: '#64748b',
                    fontStyle: 'italic',
                    textAlign: 'center'
                  }}>
                    <i className="fas fa-shield-alt" style={{marginRight: '8px', color: '#3b82f6'}}></i>
                    Our AI is analyzing multiple risk factors to keep your systems safe
                  </p>
                </div>
              )}
              
              {!analysisLoading && currentAssessment && (
                <>
                  <div className="risk-analysis-grid">
                    <div className="risk-gauge-container">
                      <h4 style={{color: 'white', marginBottom: '16px', fontSize: '1.1rem'}}>
                        <i className="fas fa-shield-alt"></i> Safety Score
                      </h4>
                      <div className={`gauge ${currentAssessment.risk_level.toLowerCase()}`}>
                        <div className="gauge-inner">{currentAssessment.risk_score}</div>
                      </div>
                      <div className="gauge-text">{currentAssessment.risk_level} RISK</div>
                      {currentAssessment.confidence && (
                        <p style={{fontSize: '0.9em', marginTop: '12px', color: 'rgba(255,255,255,0.9)', fontWeight: '500'}}>
                          <i className="fas fa-brain"></i> AI Confidence: {currentAssessment.confidence}/10
                        </p>
                      )}
                      <p style={{fontSize: '0.85rem', marginTop: '12px', color: 'rgba(255,255,255,0.8)', fontStyle: 'italic'}}>
                        {currentAssessment.risk_level === 'HIGH' ? '⚠️ Proceed with caution' :
                         currentAssessment.risk_level === 'MEDIUM' ? '⚡ Review recommended' :
                         '✅ Safe to proceed'}
                      </p>
                    </div>
                    
                    <div className="fishbone-container">
                      <h4 style={{textAlign: 'center', marginBottom: '30px', color: '#1e293b', fontSize: '1.2rem'}}>
                        <i className="fas fa-fish"></i> Risk Fishbone Diagram
                      </h4>
                      <div className="fishbone-diagram">
                        {/* Main spine */}
                        <div className="fishbone-spine"></div>
                        
                        {/* Fish head - PROBLEM */}
                        <div className="fishbone-head">
                          <div className="fishbone-problem">
                            {currentAssessment.risk_level}<br/>RISK
                          </div>
                        </div>
                        
                        {/* Top Categories */}
                        <div className="fishbone-category top" style={{left: '15%'}}>
                          <div className="category-label technical">TECHNICAL</div>
                          <div className="sub-cause">Complexity: {currentAssessment.raw_agent_scores?.technical_risk_score > 7 ? 'High' : currentAssessment.raw_agent_scores?.technical_risk_score > 5 ? 'Med' : 'Low'}</div>
                        </div>
                        <div className="fishbone-bone top" style={{left: '15%'}}></div>
                        
                        <div className="fishbone-category top" style={{left: '40%'}}>
                          <div className="category-label process">PROCESS</div>
                          <div className="sub-cause">Change: {currentAssessment.changeId?.split('-')[0] || 'Standard'}</div>
                        </div>
                        <div className="fishbone-bone top" style={{left: '40%'}}></div>
                        
                        <div className="fishbone-category top" style={{left: '65%'}}>
                          <div className="category-label timing">TIMING</div>
                          <div className="sub-cause">Impact: {currentAssessment.business_impact_timeline?.find(t => t.level !== 'Safe') ? 'Conflict' : 'Clear'}</div>
                        </div>
                        <div className="fishbone-bone top" style={{left: '65%'}}></div>
                        
                        {/* Bottom Categories */}
                        <div className="fishbone-category bottom" style={{left: '15%'}}>
                          <div className="category-label systems">SYSTEMS</div>
                          <div className="sub-cause">{currentAssessment.target_systems_analyzed?.length || 0} Target{(currentAssessment.target_systems_analyzed?.length || 0) !== 1 ? 's' : ''}</div>
                        </div>
                        <div className="fishbone-bone bottom" style={{left: '15%'}}></div>
                        
                        <div className="fishbone-category bottom" style={{left: '40%'}}>
                          <div className="category-label dependencies">DEPENDENCIES</div>
                          <div className="sub-cause">{currentAssessment.impacted_dependencies?.length || 0} Affected</div>
                        </div>
                        <div className="fishbone-bone bottom" style={{left: '40%'}}></div>
                        
                        <div className="fishbone-category bottom" style={{left: '65%'}}>
                          <div className="category-label business">BUSINESS</div>
                          <div className="sub-cause">Score: {currentAssessment.risk_score}/10</div>
                        </div>
                        <div className="fishbone-bone bottom" style={{left: '65%'}}></div>
                      </div>
                      <p className="dependency-summary-text">
                        <i className="fas fa-info-circle"></i> {currentAssessment.dependency_summary}
                      </p>
                    </div>
                  </div>

                  {/* AI Summary Card */}
                  <div className="info-card" style={{
                    marginTop: '24px',
                    borderLeft: `4px solid ${currentAssessment.risk_level === 'HIGH' ? '#ef4444' : currentAssessment.risk_level === 'MEDIUM' ? '#f59e0b' : '#22c55e'}`,
                    background: currentAssessment.risk_level === 'HIGH' ? 'linear-gradient(135deg, #fef2f2 0%, #fff 100%)' :
                                currentAssessment.risk_level === 'MEDIUM' ? 'linear-gradient(135deg, #fffbeb 0%, #fff 100%)' :
                                'linear-gradient(135deg, #f0fdf4 0%, #fff 100%)'
                  }}>
                    <div className="info-card-header">
                      <div className="info-card-icon ai">
                        <i className="fas fa-brain"></i>
                      </div>
                      <div>
                        <div className="info-card-title">
                          {currentAssessment.risk_level === 'HIGH' ? '⚠️ High Risk Detected' :
                           currentAssessment.risk_level === 'MEDIUM' ? '⚡ Moderate Risk Identified' :
                           '✅ Low Risk Change'}
                        </div>
                        <div className="info-card-subtitle">AI-powered risk analysis</div>
                      </div>
                    </div>
                    <div className="info-card-content">
                      {currentAssessment.risk_level === 'HIGH' && (
                        <div style={{padding: '14px', background: '#fee2e2', borderRadius: '8px', marginBottom: '16px', border: '2px solid #fca5a5'}}>
                          <strong style={{color: '#991b1b', display: 'block', marginBottom: '6px', fontSize: '1.05rem'}}>
                            <i className="fas fa-exclamation-triangle"></i> CAUTION REQUIRED
                          </strong>
                          <p style={{fontSize: '0.9rem', color: '#991b1b', margin: 0, lineHeight: '1.5'}}>
                            This change has been flagged as high risk. Please review all recommendations carefully and ensure proper testing before deployment.
                          </p>
                        </div>
                      )}
                      <div dangerouslySetInnerHTML={{
                        __html: currentAssessment.summary.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                      }}></div>
                    </div>
                  </div>

                  <div className="risk-analysis-grid" style={{marginTop: '24px'}}>
                    {/* Technical Card */}
                    <div className="info-card">
                      <div className="info-card-header">
                        <div className="info-card-icon technical">
                          <i className="fas fa-microchip"></i>
                        </div>
                        <div>
                          <div className="info-card-title">System Impact</div>
                          <div className="info-card-subtitle">Technical changes and complexity</div>
                        </div>
                      </div>
                      <div className="info-card-content">
                        <div style={{marginBottom: '14px'}}>
                          <span style={{
                            display: 'inline-block',
                            padding: '6px 12px',
                            background: currentAssessment.raw_agent_scores?.technical_risk_score > 7 ? '#fee2e2' :
                                       currentAssessment.raw_agent_scores?.technical_risk_score > 5 ? '#fef9c3' : '#dcfce7',
                            color: currentAssessment.raw_agent_scores?.technical_risk_score > 7 ? '#991b1b' :
                                   currentAssessment.raw_agent_scores?.technical_risk_score > 5 ? '#854d0e' : '#166534',
                            borderRadius: '8px',
                            fontSize: '0.85rem',
                            fontWeight: '700',
                            border: `1px solid ${currentAssessment.raw_agent_scores?.technical_risk_score > 7 ? '#fca5a5' :
                                                 currentAssessment.raw_agent_scores?.technical_risk_score > 5 ? '#facc15' : '#86efac'}`
                          }}>
                            <i className="fas fa-cogs" style={{marginRight: '6px'}}></i>
                            Complexity: {currentAssessment.raw_agent_scores?.technical_risk_score > 7 ? 'High' :
                                        currentAssessment.raw_agent_scores?.technical_risk_score > 5 ? 'Medium' : 'Low'}
                          </span>
                        </div>
                        <div style={{lineHeight: '1.7'}}>{currentAssessment.technical_summary}</div>
                      </div>
                    </div>
                    
                    {/* Business Timing Card */}
                    <div className="info-card">
                      <div className="info-card-header">
                        <div className="info-card-icon business">
                          <i className="fas fa-business-time"></i>
                        </div>
                        <div>
                          <div className="info-card-title">Timing & Schedule</div>
                          <div className="info-card-subtitle">Best time to make this change</div>
                        </div>
                      </div>
                      <div className="timeline-items" style={{marginTop: '12px'}}>
                        {currentAssessment.business_impact_timeline?.map((item, idx) => (
                          <div key={idx} className={`timeline-item timeline-${(item.level || 'safe').toLowerCase()}`}>
                            <div style={{fontWeight: '700', marginBottom: '4px'}}>{item.date}</div>
                            <div style={{fontSize: '0.75rem'}}>{item.event}</div>
                          </div>
                        ))}
                      </div>
                      <div className="info-card-content" style={{marginTop: '16px'}}>
                        <p style={{marginBottom: '14px', lineHeight: '1.6'}}>
                          <i className="fas fa-info-circle" style={{color: '#3b82f6', marginRight: '8px'}}></i>
                          {currentAssessment.business_summary}
                        </p>
                        <button className="btn btn-secondary" style={{width: '100%'}} onClick={handleReassessAtNight}>
                          <i className="fas fa-moon"></i> Alternative: Check Late Night (3 AM)
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Action Items Card */}
                  <div className="info-card" style={{marginTop: '24px', borderLeft: '4px solid #8b5cf6'}}>
                    <div className="info-card-header">
                      <div className="info-card-icon ai">
                        <i className="fas fa-clipboard-list"></i>
                      </div>
                      <div>
                        <div className="info-card-title">Pre-Deployment Checklist</div>
                        <div className="info-card-subtitle">Complete these steps before proceeding</div>
                      </div>
                    </div>
                    <div className="recommendations-grid" style={{marginTop: '16px'}}>
                      {currentAssessment.recommendations?.map((rec, idx) => (
                        <div key={idx} className="recommendation-card" style={{borderLeft: '4px solid #8b5cf6', paddingLeft: '16px'}}>
                          <div style={{display: 'flex', alignItems: 'flex-start', gap: '12px'}}>
                            <div style={{
                              minWidth: '28px',
                              height: '28px',
                              borderRadius: '50%',
                              background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
                              color: 'white',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '0.85rem',
                              fontWeight: '800',
                              flexShrink: 0,
                              boxShadow: '0 2px 8px rgba(139, 92, 246, 0.3)'
                            }}>
                              {idx + 1}
                            </div>
                            <p style={{margin: 0}} dangerouslySetInnerHTML={{
                              __html: rec.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                            }}></p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Important Notes Card */}
                  <div className="info-card" style={{marginTop: '24px', borderLeftColor: '#f59e0b', background: 'linear-gradient(135deg, #fef3c7 0%, #fef9c3 100%)'}}>
                    <div className="info-card-header">
                      <div className="info-card-icon warning">
                        <i className="fas fa-exclamation-triangle"></i>
                      </div>
                      <div>
                        <div className="info-card-title" style={{color: '#92400e'}}>Important Considerations</div>
                        <div className="info-card-subtitle" style={{color: '#b45309'}}>Things to keep in mind</div>
                      </div>
                    </div>
                    <div className="info-card-content" style={{color: '#92400e', fontWeight: '500'}} dangerouslySetInnerHTML={{
                      __html: (currentAssessment.critique || 'No additional notes.').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                    }}></div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Reports & Analytics Section */}
        {activeSection === 'reports' && (
          <div className="section">
            <div className="section-header">
              <i className="fas fa-chart-line"></i> Reports & Analytics Dashboard
            </div>
            <div className="section-content">
              {!analyticsData ? (
                <div style={{textAlign: 'center', padding: '60px'}}>
                  <i className="fas fa-spinner fa-spin" style={{fontSize: '3rem', color: '#3b82f6', marginBottom: '20px'}}></i>
                  <p style={{fontSize: '1.2em', color: '#64748b'}}>Loading analytics data...</p>
                </div>
              ) : (
              <>
                {/* Summary Banner */}
                <div style={{background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', padding: '24px', borderRadius: '16px', marginBottom: '32px', color: 'white', boxShadow: '0 8px 24px rgba(102, 126, 234, 0.3)'}}>
                  <h3 style={{marginBottom: '8px', fontSize: '1.5rem', fontWeight: '700'}}>
                    <i className="fas fa-chart-bar" style={{marginRight: '12px'}}></i>
                    Key Performance Insights
                  </h3>
                  <p style={{fontSize: '0.95rem', opacity: '0.95', lineHeight: '1.6'}}>
                    Overview of risk metrics and operational performance across all change requests
                  </p>
                </div>

                {/* KPI Cards */}
                <div className="kpi-grid" style={{marginBottom: '40px'}}>
                  <div className="kpi-card" style={{background: 'linear-gradient(135deg, #fef2f2 0%, #fff 100%)', borderLeft: '4px solid #dc2626'}}>
                    <div className="kpi-card-title" style={{color: '#dc2626'}}>
                      <i className="fas fa-exclamation-circle"></i>Total Incidents
                    </div>
                    <div className="kpi-card-value" style={{color: '#dc2626'}}>{analyticsData.kpis.total_incidents}</div>
                    <div className="kpi-card-context">Historical + Completed</div>
                  </div>
                  <div className="kpi-card" style={{background: 'linear-gradient(135deg, #fff5f5 0%, #fff 100%)', borderLeft: '4px solid #ef4444'}}>
                    <div className="kpi-card-title" style={{color: '#ef4444'}}>
                      <i className="fas fa-exclamation-triangle"></i>High-Risk Changes
                    </div>
                    <div className="kpi-card-value" style={{color: '#ef4444'}}>{analyticsData.kpis.total_high_risk_changes}</div>
                    <div className="kpi-card-context">Flagged for review</div>
                  </div>
                  <div className="kpi-card" style={{background: 'linear-gradient(135deg, #fffbeb 0%, #fff 100%)', borderLeft: '4px solid #f59e0b'}}>
                    <div className="kpi-card-title" style={{color: '#f59e0b'}}>
                      <i className="fas fa-clock"></i>Average Downtime
                    </div>
                    <div className="kpi-card-value" style={{color: '#f59e0b'}}>{analyticsData.kpis.average_incident_downtime}<span style={{fontSize: '1.2rem', fontWeight: '600'}}> hrs</span></div>
                    <div className="kpi-card-context">Per incident</div>
                  </div>
                  <div className="kpi-card" style={{background: 'linear-gradient(135deg, #fef2f2 0%, #fff 100%)', borderLeft: '4px solid #dc2626'}}>
                    <div className="kpi-card-title" style={{color: '#dc2626'}}>
                      <i className="fas fa-dollar-sign"></i>Revenue Impact
                    </div>
                    <div className="kpi-card-value" style={{color: '#dc2626'}}>${(analyticsData.kpis.average_revenue_impact / 1000).toFixed(1)}<span style={{fontSize: '1.2rem', fontWeight: '600'}}>K</span></div>
                    <div className="kpi-card-context">Average per incident</div>
                  </div>
                  <div className="kpi-card" style={{background: 'linear-gradient(135deg, #f0fdf4 0%, #fff 100%)', borderLeft: '4px solid #22c55e'}}>
                    <div className="kpi-card-title" style={{color: '#22c55e'}}>
                      <i className="fas fa-check-circle"></i>AI Success Rate
                    </div>
                    <div className="kpi-card-value" style={{color: '#22c55e'}}>{analyticsData.kpis.ai_approval_rate}<span style={{fontSize: '1.2rem', fontWeight: '600'}}>%</span></div>
                    <div className="kpi-card-context">Human approved</div>
                  </div>
                </div>

                {/* Charts Section */}
                <div style={{marginBottom: '24px'}}>
                  <h3 style={{fontSize: '1.3rem', fontWeight: '700', color: '#1e293b', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px'}}>
                    <i className="fas fa-chart-pie" style={{color: '#3b82f6'}}></i>
                    Risk Analysis & Trends
                  </h3>
                </div>

                <div className="analytics-grid">
                  <div className="chart-container" style={{background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)', border: '2px solid #e0e7ff', borderRadius: '16px'}}>
                    <h4 style={{fontSize: '1.1rem', fontWeight: '700', color: '#1e293b', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px'}}>
                      <i className="fas fa-chart-pie" style={{color: '#8b5cf6'}}></i>
                      Change Risk Distribution
                    </h4>
                    <div style={{padding: '20px 0'}}>
                      {getRiskDistributionChartData() && (
                        <Doughnut
                          data={getRiskDistributionChartData()}
                          options={{
                            plugins: {
                              legend: {
                                position: 'bottom',
                                labels: {
                                  padding: 15,
                                  font: {
                                    size: 12,
                                    weight: '600'
                                  }
                                }
                              }
                            },
                            maintainAspectRatio: true
                          }}
                        />
                      )}
                    </div>
                    <div style={{marginTop: '16px', padding: '12px', background: '#f8fafc', borderRadius: '8px', fontSize: '0.85rem', color: '#64748b'}}>
                      <i className="fas fa-info-circle" style={{marginRight: '6px', color: '#3b82f6'}}></i>
                      Distribution of all change requests by risk level
                    </div>
                  </div>
                  
                  <div className="chart-container" style={{background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)', border: '2px solid #e0e7ff', borderRadius: '16px'}}>
                    <h4 style={{fontSize: '1.1rem', fontWeight: '700', color: '#1e293b', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px'}}>
                      <i className="fas fa-server" style={{color: '#3b82f6'}}></i>
                      Most Impacted Services
                    </h4>
                    <div style={{padding: '20px 0'}}>
                      {getTopServicesChartData() && (
                        <Bar
                          data={getTopServicesChartData()}
                          options={{
                            indexAxis: 'y',
                            plugins: {
                              legend: {display: false}
                            },
                            scales: {
                              x: {
                                beginAtZero: true,
                                grid: {
                                  color: 'rgba(0, 0, 0, 0.05)'
                                }
                              },
                              y: {
                                grid: {
                                  display: false
                                }
                              }
                            }
                          }}
                        />
                      )}
                    </div>
                    <div style={{marginTop: '16px', padding: '12px', background: '#f8fafc', borderRadius: '8px', fontSize: '0.85rem', color: '#64748b'}}>
                      <i className="fas fa-info-circle" style={{marginRight: '6px', color: '#3b82f6'}}></i>
                      Services with most historical incidents
                    </div>
                  </div>
                </div>

                {/* Insights Section */}
                <div style={{marginTop: '32px', padding: '24px', background: 'linear-gradient(135deg, #fef3c7 0%, #fef9c3 100%)', borderRadius: '16px', border: '2px solid #fbbf24'}}>
                  <h4 style={{fontSize: '1.1rem', fontWeight: '700', color: '#92400e', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '10px'}}>
                    <i className="fas fa-lightbulb"></i>
                    Quick Insights
                  </h4>
                  <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px', marginTop: '16px'}}>
                    <div style={{fontSize: '0.9rem', color: '#92400e', lineHeight: '1.6'}}>
                      <i className="fas fa-check-circle" style={{color: '#22c55e', marginRight: '8px'}}></i>
                      <strong>{analyticsData.kpis.ai_approval_rate}%</strong> of AI assessments were approved by humans
                    </div>
                    <div style={{fontSize: '0.9rem', color: '#92400e', lineHeight: '1.6'}}>
                      <i className="fas fa-exclamation-triangle" style={{color: '#ef4444', marginRight: '8px'}}></i>
                      <strong>{analyticsData.kpis.total_high_risk_changes}</strong> changes flagged as high risk
                    </div>
                    <div style={{fontSize: '0.9rem', color: '#92400e', lineHeight: '1.6'}}>
                      <i className="fas fa-clock" style={{color: '#f59e0b', marginRight: '8px'}}></i>
                      Average downtime: <strong>{analyticsData.kpis.average_incident_downtime} hours</strong>
                    </div>
                  </div>
                </div>
              </>
              )}
            </div>
          </div>
        )}

        {/* Settings Section */}
        {activeSection === 'settings' && (
          <div className="section">
            <div className="section-header">
              <i className="fas fa-cog"></i> System Diagnostics & Alerting Toolkit
            </div>
            <div className="section-content">
              {/* Grid Layout for Diagnostic Toolkit */}
              <div style={{display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px'}}>
                
                {/* Alert Notification */}
                <div style={{background: 'white', border: '2px solid #e2e8f0', borderRadius: '12px', padding: '20px'}}>
                  <h3 style={{
                    background: 'linear-gradient(135deg, #60a5fa 0%, #3b82f6 100%)',
                    color: 'white',
                    padding: '10px 16px',
                    borderRadius: '8px',
                    fontSize: '1rem',
                    fontWeight: '700',
                    marginBottom: '20px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    <i className="fas fa-bell"></i> Alert Notification
                  </h3>
                  
                  <form onSubmit={handleSettingsSave}>
                    <div className="form-group" style={{marginBottom: '16px'}}>
                      <label style={{fontSize: '0.9rem', fontWeight: '600', color: '#475569', marginBottom: '6px', display: 'block'}}>
                        {username}
                      </label>
                    </div>
                    
                    <div className="form-group" style={{marginBottom: '16px'}}>
                      <label htmlFor="userEmail" style={{fontSize: '0.9rem', fontWeight: '600', color: '#475569', marginBottom: '6px', display: 'block'}}>
                        Email Address
                      </label>
                      <input
                        type="email"
                        id="userEmail"
                        value={userEmail}
                        onChange={(e) => setUserEmail(e.target.value)}
                        placeholder="Enter your email"
                        style={{width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9rem'}}
                      />
                    </div>
                    
                    <div style={{marginBottom: '20px'}}>
                      <label style={{fontSize: '0.9rem', fontWeight: '600', color: '#475569', marginBottom: '12px', display: 'block'}}>
                        Notification Preferences
                      </label>
                      <div className="form-switch" style={{marginBottom: '12px'}}>
                        <label className="toggle-switch">
                          <input type="checkbox" checked={emailOnHighRisk} onChange={(e) => setEmailOnHighRisk(e.target.checked)} />
                          <span className="slider"></span>
                        </label>
                        <label style={{fontSize: '0.85rem'}}>Email for HIGH or CRITICAL risk changes</label>
                      </div>
                      <div className="form-switch">
                        <label className="toggle-switch">
                          <input type="checkbox" checked={emailOnApproval} onChange={(e) => setEmailOnApproval(e.target.checked)} />
                          <span className="slider"></span>
                        </label>
                        <label style={{fontSize: '0.85rem'}}>Email for changes requiring my approval</label>
                      </div>
                    </div>
                    
                    <button type="submit" className="btn btn-primary" style={{width: '100%'}}>
                      Save Settings
                    </button>
                  </form>
                </div>
                
                {/* System Monitoring */}
                <div style={{background: 'white', border: '2px solid #e2e8f0', borderRadius: '12px', padding: '20px'}}>
                  <h3 style={{
                    background: 'linear-gradient(135deg, #60a5fa 0%, #3b82f6 100%)',
                    color: 'white',
                    padding: '10px 16px',
                    borderRadius: '8px',
                    fontSize: '1rem',
                    fontWeight: '700',
                    marginBottom: '20px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    <i className="fas fa-desktop"></i> System Monitoring
                  </h3>
                  
                  <div className="form-group" style={{marginBottom: '16px'}}>
                    <label style={{fontSize: '0.9rem', fontWeight: '600', color: '#475569', marginBottom: '6px', display: 'block'}}>
                      System Select
                    </label>
                    <select style={{width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9rem', background: '#1e293b', color: 'white'}}>
                      <option value="">-- Select System Type --</option>
                      <option value="hosts">Hosts</option>
                      <option value="system">System</option>
                      <option value="docker">Docker</option>
                      <option value="database">Database</option>
                      <option value="api">API</option>
                    </select>
                  </div>
                  
                  <div className="form-group" style={{marginBottom: '16px'}}>
                    <label style={{fontSize: '0.9rem', fontWeight: '600', color: '#475569', marginBottom: '6px', display: 'block'}}>
                      System Log
                    </label>
                    <select style={{width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9rem', background: '#1e293b', color: 'white'}}>
                      <option value="">-- Select Log Platform --</option>
                      <option value="splunk">Splunk</option>
                      <option value="dynatrace">DynaTrace</option>
                      <option value="nagios">Nagios</option>
                      <option value="solarwinds">Solarwinds</option>
                      <option value="grafana">Grafana</option>
                    </select>
                  </div>
                  
                  <div className="form-group">
                    <label style={{fontSize: '0.9rem', fontWeight: '600', color: '#475569', marginBottom: '6px', display: 'block'}}>
                      Predict Disruption
                    </label>
                    <select style={{width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9rem', background: '#1e293b', color: 'white'}}>
                      <option value="">-- Select Analysis Method --</option>
                      <option value="trend">Trend Analysis</option>
                      <option value="outlier">Outlier Event Detection</option>
                      <option value="both">Trend + Outlier Detection</option>
                    </select>
                  </div>
                </div>
                
                {/* Outlier Detection */}
                <div style={{background: 'white', border: '2px solid #e2e8f0', borderRadius: '12px', padding: '20px'}}>
                  <h3 style={{
                    background: 'linear-gradient(135deg, #60a5fa 0%, #3b82f6 100%)',
                    color: 'white',
                    padding: '10px 16px',
                    borderRadius: '8px',
                    fontSize: '1rem',
                    fontWeight: '700',
                    marginBottom: '20px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    <i className="fas fa-chart-line"></i> Outlier Detection
                  </h3>
                  
                  <div className="form-group" style={{marginBottom: '16px'}}>
                    <label style={{fontSize: '0.9rem', fontWeight: '600', color: '#475569', marginBottom: '6px', display: 'block'}}>
                      System Select
                    </label>
                    <select style={{width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9rem', background: '#1e293b', color: 'white'}}>
                      <option value="">-- Select System Type --</option>
                      <option value="hosts">Hosts</option>
                      <option value="system">System</option>
                      <option value="docker">Docker</option>
                      <option value="database">Database</option>
                      <option value="api">API</option>
                    </select>
                  </div>
                  
                  <div className="form-group" style={{marginBottom: '16px'}}>
                    <label style={{fontSize: '0.9rem', fontWeight: '600', color: '#475569', marginBottom: '6px', display: 'block'}}>
                      Outlier Events
                    </label>
                    <select style={{width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9rem', background: '#1e293b', color: 'white'}}>
                      <option value="">-- Select Event Type --</option>
                      <option value="log_trends">System Log Trends</option>
                      <option value="cpu_spikes">CPU Spikes</option>
                      <option value="memory_leaks">Memory Leaks</option>
                      <option value="network_anomalies">Network Anomalies</option>
                      <option value="error_rates">Error Rate Spikes</option>
                    </select>
                  </div>
                  
                  <div className="form-group">
                    <label style={{fontSize: '0.9rem', fontWeight: '600', color: '#475569', marginBottom: '6px', display: 'block'}}>
                      Outlier Computation
                    </label>
                    <select style={{width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9rem', background: '#1e293b', color: 'white'}}>
                      <option value="">-- Select Method --</option>
                      <option value="iqr">IQR (Interquartile Range)</option>
                      <option value="zscore">Z-Score</option>
                      <option value="arima">ARIMA (Time Series)</option>
                      <option value="isolation_forest">Isolation Forest</option>
                    </select>
                  </div>
                </div>
                
                {/* Event Correlation */}
                <div style={{background: 'white', border: '2px solid #e2e8f0', borderRadius: '12px', padding: '20px'}}>
                  <h3 style={{
                    background: 'linear-gradient(135deg, #60a5fa 0%, #3b82f6 100%)',
                    color: 'white',
                    padding: '10px 16px',
                    borderRadius: '8px',
                    fontSize: '1rem',
                    fontWeight: '700',
                    marginBottom: '20px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    <i className="fas fa-link"></i> Event Correlation
                  </h3>
                  
                  <div className="form-group" style={{marginBottom: '16px'}}>
                    <label style={{fontSize: '0.9rem', fontWeight: '600', color: '#475569', marginBottom: '6px', display: 'block'}}>
                      Pairs of System Select
                    </label>
                    <select style={{width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9rem', background: '#1e293b', color: 'white'}}>
                      <option value="">-- Select System Pairs --</option>
                      <option value="hosts">Hosts</option>
                      <option value="system">System</option>
                      <option value="docker">Docker</option>
                      <option value="database">Database</option>
                      <option value="api">API</option>
                      <option value="all">All Systems</option>
                    </select>
                  </div>
                  
                  <div className="form-group" style={{marginBottom: '16px'}}>
                    <label style={{fontSize: '0.9rem', fontWeight: '600', color: '#475569', marginBottom: '6px', display: 'block'}}>
                      Correlating Events
                    </label>
                    <select style={{width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9rem', background: '#1e293b', color: 'white'}}>
                      <option value="">-- Select Event Source --</option>
                      <option value="incidents">Alerts from Incidents</option>
                      <option value="logs">Alerts from Logs</option>
                      <option value="both">Incidents + Logs</option>
                      <option value="metrics">System Metrics</option>
                    </select>
                  </div>
                  
                  <div className="form-group">
                    <label style={{fontSize: '0.9rem', fontWeight: '600', color: '#475569', marginBottom: '6px', display: 'block'}}>
                      Correlation Computation
                    </label>
                    <select style={{width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9rem', background: '#1e293b', color: 'white'}}>
                      <option value="">-- Select Method --</option>
                      <option value="pearson">Pearson Correlation</option>
                      <option value="kendall">Kendall Tau</option>
                      <option value="spearman">Spearman Rank</option>
                      <option value="mutual_info">Mutual Information</option>
                    </select>
                  </div>
                </div>
                
                {/* Incident Topic Clustering */}
                <div style={{background: 'white', border: '2px solid #e2e8f0', borderRadius: '12px', padding: '20px'}}>
                  <h3 style={{
                    background: 'linear-gradient(135deg, #60a5fa 0%, #3b82f6 100%)',
                    color: 'white',
                    padding: '10px 16px',
                    borderRadius: '8px',
                    fontSize: '1rem',
                    fontWeight: '700',
                    marginBottom: '20px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    <i className="fas fa-layer-group"></i> Incident Topic Clustering
                  </h3>
                  
                  <div className="form-group" style={{marginBottom: '16px'}}>
                    <label style={{fontSize: '0.9rem', fontWeight: '600', color: '#475569', marginBottom: '6px', display: 'block'}}>
                      ServiceNow or PagerDuty or JIRA Incidents
                    </label>
                    <select style={{width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9rem', background: '#1e293b', color: 'white'}}>
                      <option value="">-- Select Source & Date Range --</option>
                      <option value="servicenow_7d">ServiceNow (Last 7 days)</option>
                      <option value="servicenow_30d">ServiceNow (Last 30 days)</option>
                      <option value="pagerduty_7d">PagerDuty (Last 7 days)</option>
                      <option value="pagerduty_30d">PagerDuty (Last 30 days)</option>
                      <option value="jira_7d">JIRA (Last 7 days)</option>
                      <option value="jira_30d">JIRA (Last 30 days)</option>
                      <option value="all_90d">All Sources (Last 90 days)</option>
                    </select>
                  </div>
                  
                  <div className="form-group" style={{marginBottom: '16px'}}>
                    <label style={{fontSize: '0.9rem', fontWeight: '600', color: '#475569', marginBottom: '6px', display: 'block'}}>
                      Issue Category Pareto
                    </label>
                    <select style={{width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9rem', background: '#1e293b', color: 'white'}}>
                      <option value="">-- Select Analysis Type --</option>
                      <option value="topic">Topic Analysis</option>
                      <option value="top5">Top 5 Categories</option>
                      <option value="top10">Top 10 Categories</option>
                      <option value="top20">Top 20 Categories</option>
                      <option value="custom">Custom TopN</option>
                    </select>
                  </div>
                  
                  <div className="form-group">
                    <label style={{fontSize: '0.9rem', fontWeight: '600', color: '#475569', marginBottom: '6px', display: 'block'}}>
                      Root Cause Fishbone
                    </label>
                    <select style={{width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9rem', background: '#1e293b', color: 'white'}}>
                      <option value="">-- Select Analysis --</option>
                      <option value="propensity">Propensity Analysis</option>
                      <option value="frequency">Frequency Analysis</option>
                      <option value="impact">Impact Analysis</option>
                      <option value="severity">Severity Weighted</option>
                    </select>
                  </div>
                </div>
                
                {/* Risk Knowledge Graph */}
                <div style={{background: 'white', border: '2px solid #e2e8f0', borderRadius: '12px', padding: '20px'}}>
                  <h3 style={{
                    background: 'linear-gradient(135deg, #60a5fa 0%, #3b82f6 100%)',
                    color: 'white',
                    padding: '10px 16px',
                    borderRadius: '8px',
                    fontSize: '1rem',
                    fontWeight: '700',
                    marginBottom: '20px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    <i className="fas fa-project-diagram"></i> Risk Knowledge Graph
                  </h3>
                  
                  <div className="form-group" style={{marginBottom: '16px'}}>
                    <label style={{fontSize: '0.9rem', fontWeight: '600', color: '#475569', marginBottom: '6px', display: 'block'}}>
                      System Select
                    </label>
                    <select style={{width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9rem', background: '#1e293b', color: 'white'}}>
                      <option value="">-- Select System Type --</option>
                      <option value="hosts">Hosts</option>
                      <option value="system">System</option>
                      <option value="docker">Docker</option>
                      <option value="database">Database</option>
                      <option value="api">API</option>
                    </select>
                  </div>
                  
                  <div className="form-group" style={{marginBottom: '16px'}}>
                    <label style={{fontSize: '0.9rem', fontWeight: '600', color: '#475569', marginBottom: '6px', display: 'block'}}>
                      Graph Tree
                    </label>
                    <select style={{width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9rem', background: '#1e293b', color: 'white'}}>
                      <option value="">-- Select Graph Component --</option>
                      <option value="entity">Entity or Node Name</option>
                      <option value="attributes">Entity Attributes or Metadata</option>
                      <option value="edge">Edge or Relationship</option>
                      <option value="full">Full Graph Structure</option>
                    </select>
                  </div>
                  
                  <div className="form-group">
                    <label style={{fontSize: '0.9rem', fontWeight: '600', color: '#475569', marginBottom: '6px', display: 'block'}}>
                      Graph Query
                    </label>
                    <select style={{width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9rem', background: '#1e293b', color: 'white'}}>
                      <option value="">-- Select Query Type --</option>
                      <option value="entity_name">Search by Entity Name</option>
                      <option value="embeddings">Search by Embeddings</option>
                      <option value="relationships">Search by Relationships</option>
                      <option value="similarity">Semantic Similarity</option>
                      <option value="path">Path Finding</option>
                    </select>
                  </div>
                </div>
                
              </div>
              
              {/* Info Banner */}
              <div style={{
                marginTop: '24px',
                padding: '16px 20px',
                background: 'linear-gradient(135deg, #dbeafe 0%, #eff6ff 100%)',
                borderRadius: '12px',
                border: '2px solid #93c5fd'
              }}>
                <p style={{margin: 0, color: '#1e40af', fontSize: '0.95rem', lineHeight: '1.6', display: 'flex', alignItems: 'center', gap: '10px'}}>
                  <i className="fas fa-info-circle" style={{fontSize: '1.2rem'}}></i>
                  <span>
                    <strong>Advanced Features:</strong> System Monitoring, Outlier Detection, Event Correlation, Incident Clustering, and Knowledge Graph capabilities are part of our enterprise roadmap. These will integrate with JIRA, ServiceNow, and monitoring tools like Splunk and Datadog.
                  </span>
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Alerts Container */}
      <div className="alerts">
        {alerts.map((alert) => (
          <div key={alert.id} className={`alert alert-${alert.type}`}>
            <button className="alert-close-btn" onClick={() => setAlerts(prev => prev.filter(a => a.id !== alert.id))}>
              &times;
            </button>
            <div className="alert-title">
              <i className={`fas ${alert.type === 'error' ? 'fa-exclamation-triangle' : alert.type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}`}></i>
              {alert.type.charAt(0).toUpperCase() + alert.type.slice(1)}
            </div>
            <p>{alert.message}</p>
          </div>
        ))}
      </div>

      {/* Submission Modal */}
      <div className={`modal ${showSubmissionModal ? 'show' : ''}`}>
        <div className="modal-content">
          <div className="modal-header">
            <h2><i className="fas fa-rocket"></i> Request a System Change</h2>
            <button className="close" onClick={() => setShowSubmissionModal(false)}>&times;</button>
          </div>
          <div className="modal-body">
            <form onSubmit={handleChangeSubmit}>
              <div className="form-group">
                <label htmlFor="changeType"><i className="fas fa-tags"></i> What type of change are you making?</label>
                <select id="changeType" value={changeForm.change_type} onChange={(e) => setChangeForm({...changeForm, change_type: e.target.value})} required>
                  <option value="">-- Please select a change type --</option>
                  <option value="Patch">🔧 Security or Software Update</option>
                  <option value="Config">⚙️ Configuration Adjustment</option>
                  <option value="Infra">🏗️ Infrastructure Modification</option>
                  <option value="Feature">✨ New Feature Deployment</option>
                  <option value="Bug Fix">🐛 Bug Fix or Correction</option>
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="priority"><i className="fas fa-exclamation-circle"></i> How urgent is this change?</label>
                <select id="priority" value={changeForm.priority} onChange={(e) => setChangeForm({...changeForm, priority: e.target.value})} required>
                  <option value="">-- Select urgency level --</option>
                  <option value="Low">⚪ Low - Can wait for next maintenance window</option>
                  <option value="Medium">🟡 Medium - Needs to be done soon</option>
                  <option value="High">🟠 High - Requires immediate attention</option>
                  <option value="Critical">🔴 Critical - Emergency change needed</option>
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="targetSystems"><i className="fas fa-server"></i> Which applications or services will be affected?</label>
                <input
                  type="text"
                  id="targetSystems"
                  value={changeForm.target_systems}
                  onChange={(e) => setChangeForm({...changeForm, target_systems: e.target.value})}
                  placeholder="Example: Payment System, User Database, API Gateway"
                  required
                />
                <small style={{display: 'block', marginTop: '6px', color: '#64748b', fontSize: '0.85rem'}}>
                  💡 Tip: Separate multiple systems with commas
                </small>
              </div>
              <div className="form-group">
                <label><i className="fas fa-calendar-alt"></i> Proposed Deployment Schedule</label>
                <div style={{display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px'}}>
                  <input
                    type="date"
                    id="proposedDate"
                    value={changeForm.proposed_date}
                    onChange={(e) => setChangeForm({...changeForm, proposed_date: e.target.value})}
                    required
                    style={{borderRadius: '6px'}}
                  />
                  <input
                    type="time"
                    id="proposedTime"
                    value={changeForm.deployment_time}
                    onChange={(e) => setChangeForm({...changeForm, deployment_time: e.target.value})}
                    required
                    style={{borderRadius: '6px'}}
                  />
                </div>
                <small style={{display: 'block', marginTop: '6px', color: '#64748b', fontSize: '0.85rem'}}>
                  📅 Select your preferred date and time for deployment
                </small>
              </div>
              <div className="form-group">
                <label htmlFor="notes"><i className="fas fa-edit"></i> Describe what you're planning to change</label>
                <textarea
                  id="notes"
                  rows="4"
                  value={changeForm.documentation_notes}
                  onChange={(e) => setChangeForm({...changeForm, documentation_notes: e.target.value})}
                  placeholder="Please provide details about the change, what it will do, and why it's needed..."
                  required
                  style={{resize: 'vertical'}}
                ></textarea>
              </div>
              <div style={{display: 'flex', justifyContent: 'flex-end', marginTop: '20px'}}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowSubmissionModal(false)} style={{marginRight: '12px'}}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? <><i className="fas fa-spinner fa-spin"></i> Analyzing...</> : '🚀 Submit & Analyze'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      {/* Reject Modal */}
      <div className={`modal ${showRejectModal ? 'show' : ''}`}>
        <div className="modal-content">
          <div className="modal-header">
            <h2><i className="fas fa-times-circle"></i> Reject Change</h2>
            <button className="close" onClick={() => setShowRejectModal(false)}>&times;</button>
          </div>
          <div className="modal-body">
            <form onSubmit={handleRejectSubmit}>
              <div className="form-group">
                <label>Reason for Rejection:</label>
                <textarea rows="5" value={rejectForm.reason} onChange={(e) => setRejectForm({...rejectForm, reason: e.target.value})} required placeholder="Provide a clear reason..."></textarea>
              </div>
              <div className="form-group">
                <label>Feedback on AI:</label>
                <select value={rejectForm.feedbackType} onChange={(e) => setRejectForm({...rejectForm, feedbackType: e.target.value})}>
                  <option value="none">-- Select --</option>
                  <option value="accurate">AI accurate</option>
                  <option value="inaccurate_risk">Risk level inaccurate</option>
                  <option value="poor_recs">Recs poor</option>
                  <option value="missing_context">AI missed context</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div style={{display: 'flex', justifyContent: 'flex-end', marginTop: '20px'}}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowRejectModal(false)} style={{marginRight: '12px'}}>Cancel</button>
                <button type="submit" className="btn btn-danger">Submit Rejection</button>
              </div>
            </form>
          </div>
        </div>
      </div>

      {/* Postmortem Modal */}
      <div className={`modal ${showPostmortemModal ? 'show' : ''}`}>
        <div className="modal-content">
          <div className="modal-header">
            <h2><i className="fas fa-search"></i> AI Post-Mortem Assistant</h2>
            <button className="close" onClick={() => setShowPostmortemModal(false)}>&times;</button>
          </div>
          <div className="modal-body">
            <h4 style={{marginBottom: '20px'}}>{postmortemData?.title}</h4>
            {postmortemLoading ? (
              <div style={{textAlign: 'center'}}>
                <p><i className="fas fa-spinner fa-spin"></i> AI is analyzing the incident...</p>
              </div>
            ) : (
              <div>
                <h5>Suggested Preventative Measures:</h5>
                <ul style={{listStylePosition: 'inside', paddingLeft: '10px'}}>
                  {postmortemSuggestions.map((measure, idx) => (
                    <li key={idx}>{measure}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Incident Detail Modal */}
      <div className={`modal ${showIncidentDetailModal ? 'show' : ''}`}>
        <div className="modal-content" style={{maxWidth: '800px'}}>
          <div className="modal-header">
            <h2>
              <i className={`fas ${selectedIncident?.type === 'incident' ? 'fa-history' : 'fa-clipboard-check'}`}></i>
              {selectedIncident?.type === 'incident' ? 'Incident Details' : 'Change Request Details'}
            </h2>
            <button className="close" onClick={() => {
              setShowIncidentDetailModal(false);
              setSelectedIncident(null);
            }}>&times;</button>
          </div>
          <div className="modal-body">
            {selectedIncident && (
              <>
                {/* Header Info */}
                <div style={{marginBottom: '24px'}}>
                  <h3 style={{fontSize: '1.3rem', fontWeight: '700', color: '#1e293b', marginBottom: '12px'}}>
                    {selectedIncident.title}
                  </h3>
                  <div style={{display: 'flex', flexWrap: 'wrap', gap: '16px', marginBottom: '16px'}}>
                    <div>
                      <strong style={{color: '#64748b', fontSize: '0.85rem'}}>ID:</strong>
                      <div style={{fontSize: '0.95rem', color: '#1e293b', marginTop: '4px'}}>
                        {selectedIncident.incidentId || selectedIncident.changeId}
                      </div>
                    </div>
                    <div>
                      <strong style={{color: '#64748b', fontSize: '0.85rem'}}>Date:</strong>
                      <div style={{fontSize: '0.95rem', color: '#1e293b', marginTop: '4px'}}>
                        {selectedIncident.date || selectedIncident.completedDate}
                        {selectedIncident.completedTime && ` at ${selectedIncident.completedTime}`}
                      </div>
                    </div>
                    <div>
                      <strong style={{color: '#64748b', fontSize: '0.85rem'}}>Category:</strong>
                      <div style={{fontSize: '0.95rem', color: '#1e293b', marginTop: '4px'}}>
                        {selectedIncident.category}
                      </div>
                    </div>
                    <div>
                      <strong style={{color: '#64748b', fontSize: '0.85rem'}}>Risk Level:</strong>
                      <div style={{marginTop: '4px'}}>
                        <span className={`tag tag-${(selectedIncident.riskLevel || 'low').toLowerCase()}`}>
                          {(selectedIncident.riskLevel || 'N/A').toUpperCase()}
                        </span>
                      </div>
                    </div>
                    {selectedIncident.submittedBy && (
                      <div>
                        <strong style={{color: '#64748b', fontSize: '0.85rem'}}>Submitted By:</strong>
                        <div style={{fontSize: '0.95rem', color: '#1e293b', marginTop: '4px'}}>
                          {selectedIncident.submittedBy}
                        </div>
                      </div>
                    )}
                    {selectedIncident.decision && (
                      <div>
                        <strong style={{color: '#64748b', fontSize: '0.85rem'}}>Decision:</strong>
                        <div style={{marginTop: '4px'}}>
                          <span style={{
                            padding: '4px 10px',
                            borderRadius: '6px',
                            fontSize: '0.85rem',
                            fontWeight: '700',
                            background: selectedIncident.decision === 'Approved' ? '#d1fae5' : '#fee2e2',
                            color: selectedIncident.decision === 'Approved' ? '#065f46' : '#991b1b',
                            border: `1px solid ${selectedIncident.decision === 'Approved' ? '#86efac' : '#fca5a5'}`
                          }}>
                            {selectedIncident.decision}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Impact Metrics for Incidents */}
                {selectedIncident.type === 'incident' && (
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: '16px',
                    marginBottom: '24px',
                    padding: '20px',
                    background: '#fef2f2',
                    borderRadius: '12px',
                    border: '2px solid #fecaca'
                  }}>
                    <div>
                      <div style={{fontSize: '0.75rem', color: '#991b1b', fontWeight: '700', marginBottom: '8px', textTransform: 'uppercase'}}>
                        <i className="fas fa-clock" style={{marginRight: '6px'}}></i>Downtime
                      </div>
                      <div style={{fontSize: '1.5rem', fontWeight: '800', color: '#dc2626'}}>
                        {selectedIncident.downtime || 'N/A'}
                      </div>
                    </div>
                    <div>
                      <div style={{fontSize: '0.75rem', color: '#991b1b', fontWeight: '700', marginBottom: '8px', textTransform: 'uppercase'}}>
                        <i className="fas fa-users" style={{marginRight: '6px'}}></i>Affected Users
                      </div>
                      <div style={{fontSize: '1.5rem', fontWeight: '800', color: '#dc2626'}}>
                        {selectedIncident.affectedUsers?.toLocaleString() || 'N/A'}
                      </div>
                    </div>
                    <div>
                      <div style={{fontSize: '0.75rem', color: '#991b1b', fontWeight: '700', marginBottom: '8px', textTransform: 'uppercase'}}>
                        <i className="fas fa-dollar-sign" style={{marginRight: '6px'}}></i>Revenue Impact
                      </div>
                      <div style={{fontSize: '1.5rem', fontWeight: '800', color: '#dc2626'}}>
                        {selectedIncident.revenue_impact || 'N/A'}
                      </div>
                    </div>
                    <div>
                      <div style={{fontSize: '0.75rem', color: '#991b1b', fontWeight: '700', marginBottom: '8px', textTransform: 'uppercase'}}>
                        <i className="fas fa-undo" style={{marginRight: '6px'}}></i>Rollback Time
                      </div>
                      <div style={{fontSize: '1.5rem', fontWeight: '800', color: '#dc2626'}}>
                        {selectedIncident.rollbackTime || 'N/A'}
                      </div>
                    </div>
                    {selectedIncident.slaBreached && (
                      <div style={{gridColumn: '1 / -1', textAlign: 'center', marginTop: '8px'}}>
                        <span style={{
                          padding: '8px 16px',
                          background: '#fee2e2',
                          color: '#991b1b',
                          borderRadius: '8px',
                          fontSize: '0.9rem',
                          fontWeight: '700',
                          border: '2px solid #fca5a5'
                        }}>
                          <i className="fas fa-ban" style={{marginRight: '8px'}}></i>
                          SLA BREACH
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Risk Score for Completed Changes */}
                {selectedIncident.type === 'completed_change' && selectedIncident.riskScore && (
                  <div style={{
                    padding: '20px',
                    background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
                    borderRadius: '12px',
                    border: '2px solid #93c5fd',
                    marginBottom: '24px',
                    textAlign: 'center'
                  }}>
                    <div style={{fontSize: '0.85rem', color: '#1e40af', fontWeight: '700', marginBottom: '8px'}}>
                      AI RISK ASSESSMENT SCORE
                    </div>
                    <div style={{fontSize: '3rem', fontWeight: '800', color: '#2563eb'}}>
                      {selectedIncident.riskScore}
                    </div>
                    <div style={{fontSize: '0.9rem', color: '#1e40af', marginTop: '4px'}}>
                      Safety Score (1-10 scale)
                    </div>
                  </div>
                )}

                {/* Root Cause or Summary */}
                <div style={{
                  padding: '20px',
                  background: '#f8fafc',
                  borderRadius: '12px',
                  border: '2px solid #e2e8f0',
                  marginBottom: '20px'
                }}>
                  <h4 style={{fontSize: '1.1rem', fontWeight: '700', color: '#1e293b', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px'}}>
                    <i className={`fas ${selectedIncident.type === 'incident' ? 'fa-search' : 'fa-brain'}`} style={{color: '#3b82f6'}}></i>
                    {selectedIncident.type === 'incident' ? 'Root Cause Analysis' : 'AI Risk Analysis Summary'}
                  </h4>
                  <p style={{fontSize: '1rem', color: '#334155', lineHeight: '1.8', margin: 0}}>
                    {selectedIncident.type === 'incident' ? selectedIncident.rootCause : selectedIncident.summary}
                  </p>
                </div>

                {/* Rejection Reason */}
                {selectedIncident.decision === 'Rejected' && selectedIncident.rejectionReason && (
                  <div style={{
                    padding: '20px',
                    background: '#fef2f2',
                    borderRadius: '12px',
                    border: '2px solid #fca5a5',
                    marginBottom: '20px'
                  }}>
                    <h4 style={{fontSize: '1.1rem', fontWeight: '700', color: '#991b1b', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px'}}>
                      <i className="fas fa-ban" style={{color: '#ef4444'}}></i>
                      Rejection Reason
                    </h4>
                    <p style={{fontSize: '1rem', color: '#991b1b', lineHeight: '1.8', margin: 0}}>
                      {selectedIncident.rejectionReason}
                    </p>
                    {selectedIncident.feedbackType && selectedIncident.feedbackType !== 'none' && (
                      <div style={{marginTop: '12px', fontSize: '0.9rem', color: '#7f1d1d'}}>
                        <strong>Feedback Type:</strong> {selectedIncident.feedbackType}
                      </div>
                    )}
                  </div>
                )}

                {/* AI Postmortem Button for Incidents */}
                {selectedIncident.type === 'incident' && (
                  <div style={{marginTop: '24px', textAlign: 'center'}}>
                    <button
                      className="btn btn-primary"
                      onClick={() => {
                        setShowIncidentDetailModal(false);
                        handlePostmortemClick(selectedIncident);
                      }}
                      style={{minWidth: '250px'}}
                    >
                      <i className="fas fa-robot" style={{marginRight: '8px'}}></i>
                      Get AI Prevention Recommendations
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Email Notification Modal */}
      <div className={`modal ${showEmailModal ? 'show' : ''}`}>
        <div className="modal-content">
          <div className="modal-header">
            <h2><i className="fas fa-envelope"></i> Send Email Notification</h2>
            <button className="close" onClick={() => {
              setShowEmailModal(false);
              setRecipientEmail('');
              setPendingChangeForEmail(null);
            }}>&times;</button>
          </div>
          <div className="modal-body">
            <div style={{marginBottom: '24px', padding: '16px', background: '#eff6ff', borderRadius: '8px', border: '1px solid #93c5fd'}}>
              <p style={{margin: 0, color: '#1e40af', fontSize: '0.95rem', lineHeight: '1.6'}}>
                <i className="fas fa-info-circle" style={{marginRight: '8px'}}></i>
                <strong>Send high-risk change notification to business stakeholders.</strong><br/>
                This will send a detailed email with AI risk assessment, recommendations, and action items.
              </p>
            </div>
            
            <form onSubmit={handleSendEmail}>
              <div className="form-group">
                <label htmlFor="recipientEmail">
                  <i className="fas fa-user"></i> Recipient Email Address
                </label>
                <input
                  type="email"
                  id="recipientEmail"
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                  placeholder="stakeholder@company.com"
                  required
                  disabled={emailSending}
                />
                <small style={{display: 'block', marginTop: '6px', color: '#64748b', fontSize: '0.85rem'}}>
                  💡 Enter the email address of the business stakeholder or decision maker
                </small>
              </div>
              
              <div style={{
                marginTop: '20px',
                padding: '16px',
                background: '#fef3c7',
                borderRadius: '8px',
                border: '1px solid #fbbf24'
              }}>
                <p style={{margin: 0, color: '#92400e', fontSize: '0.9rem', lineHeight: '1.6'}}>
                  <i className="fas fa-shield-alt" style={{marginRight: '8px'}}></i>
                  <strong>Email will include:</strong>
                </p>
                <ul style={{marginTop: '8px', marginBottom: 0, color: '#92400e', fontSize: '0.85rem', paddingLeft: '24px'}}>
                  <li>Risk level and safety score</li>
                  <li>AI-generated risk assessment summary</li>
                  <li>Detailed recommendations and action items</li>
                  <li>Business impact analysis</li>
                  <li>Link to review in dashboard</li>
                </ul>
              </div>
              
              <div style={{display: 'flex', justifyContent: 'flex-end', marginTop: '24px', gap: '12px'}}>
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  onClick={() => {
                    setShowEmailModal(false);
                    setRecipientEmail('');
                    setPendingChangeForEmail(null);
                  }}
                  disabled={emailSending}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="btn btn-primary" 
                  disabled={emailSending}
                  style={{minWidth: '120px'}}
                >
                  {emailSending ? (
                    <><i className="fas fa-spinner fa-spin"></i> Sending...</>
                  ) : (
                    <><i className="fas fa-paper-plane"></i> Send Email</>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
