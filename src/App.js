import React, { useState, useEffect } from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, ScatterChart, Scatter, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from 'recharts';
import { TrendingUp, Globe, Zap, AlertCircle, Network, Brain, Calendar, Target } from 'lucide-react';

// Add Tailwind CSS via CDN
const style = document.createElement('style');
style.textContent = `
  @import url('https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css');
  
  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }
  
  body {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen',
      'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue',
      sans-serif;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }
  
  .recharts-wrapper {
    margin: 0 auto;
  }
`;
document.head.appendChild(style);

const PetronasIntelDashboard = () => {
  const [data, setData] = useState([]);
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedCategory, setSelectedCategory] = useState('all');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        // Fetch CSV from GitHub raw URL
        const response = await fetch('https://raw.githubusercontent.com/booluckgmie/sharecode/refs/heads/master/marketIntel/petronasGAlerts2025.csv');
        
        if (!response.ok) {
          throw new Error('Failed to fetch data');
        }
        
        const csvText = await response.text();
        
        const parseCSV = (csv) => {
          const lines = csv.split('\n');
          return lines.slice(1).filter(line => line.trim()).map(line => {
            const values = line.match(/(".*?"|[^,]+)(?=\s*,|\s*$)/g);
            if (!values || values.length < 4) return null;
            return {
              id: values[0]?.replace(/"/g, ''),
              title: values[1]?.replace(/"/g, ''),
              published: new Date(values[2]?.replace(/"/g, '')),
              url: values[3]?.replace(/"/g, '')
            };
          }).filter(Boolean);
        };

        const parsedData = parseCSV(csvText);
        setData(parsedData);
        setLoading(false);
      } catch (err) {
        setError(err.message);
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Categorize news
  const categorizeNews = (item) => {
    const title = item.title.toLowerCase();
    if (title.includes('gas') || title.includes('oil') || title.includes('upstream') || title.includes('pipeline')) return 'Energy & Gas';
    if (title.includes('chemical') || title.includes('butac') || title.includes('polymer')) return 'Chemicals';
    if (title.includes('renewable') || title.includes('solar') || title.includes('hydrogen') || title.includes('green') || title.includes('ev')) return 'Renewables';
    if (title.includes('f1') || title.includes('formula') || title.includes('motorsport')) return 'Sponsorship';
    if (title.includes('market') || title.includes('stock') || title.includes('epf') || title.includes('investment')) return 'Financial';
    if (title.includes('brazil') || title.includes('international') || title.includes('australia') || title.includes('georgia')) return 'International';
    return 'Other';
  };

  const categorizedData = data.map(item => ({
    ...item,
    category: categorizeNews(item)
  }));

  // Analytics calculations
  const categoryDistribution = categorizedData.reduce((acc, item) => {
    acc[item.category] = (acc[item.category] || 0) + 1;
    return acc;
  }, {});

  const pieData = Object.entries(categoryDistribution).map(([name, value]) => ({
    name,
    value
  }));

  const timelineData = categorizedData.reduce((acc, item) => {
    const date = item.published.toISOString().split('T')[0];
    acc[date] = (acc[date] || 0) + 1;
    return acc;
  }, {});

  const timelineChartData = Object.entries(timelineData).map(([date, count]) => ({
    date,
    count
  })).sort((a, b) => new Date(a.date) - new Date(b.date));

  // Network analysis - co-occurrence of topics
  const topicKeywords = {
    'Gas': ['gas', 'lng', 'pipeline', 'upstream'],
    'Renewable': ['solar', 'hydrogen', 'green', 'renewable'],
    'Chemical': ['chemical', 'polymer', 'butac'],
    'Electric': ['ev', 'electric', 'e-bike'],
    'Malaysia': ['malaysia', 'malaysian'],
    'International': ['brazil', 'australia', 'georgia']
  };

  const getTopics = (title) => {
    const topics = [];
    const lowerTitle = title.toLowerCase();
    for (const [topic, keywords] of Object.entries(topicKeywords)) {
      if (keywords.some(kw => lowerTitle.includes(kw))) {
        topics.push(topic);
      }
    }
    return topics;
  };

  // Create network data with proper aggregation
  const networkMap = new Map();
  categorizedData.forEach(item => {
    const topics = getTopics(item.title);
    for (let i = 0; i < topics.length; i++) {
      for (let j = i + 1; j < topics.length; j++) {
        const key = `${topics[i]}-${topics[j]}`;
        const reverseKey = `${topics[j]}-${topics[i]}`;
        const existingKey = networkMap.has(key) ? key : reverseKey;
        
        if (networkMap.has(existingKey)) {
          networkMap.set(existingKey, networkMap.get(existingKey) + 1);
        } else {
          networkMap.set(key, 1);
        }
      }
    }
  });

  // Convert to array format for bubble chart
  const networkData = Array.from(networkMap.entries()).map(([key, count]) => {
    const [topic1, topic2] = key.split('-');
    return { 
      topic1, 
      topic2, 
      value: count,
      // Add numeric coordinates for scatter plot
      x: Object.keys(topicKeywords).indexOf(topic1),
      y: Object.keys(topicKeywords).indexOf(topic2),
      z: count * 100 // Size of bubble
    };
  });

  // Strategic insights
  const insights = [
    {
      title: 'Energy Transition Focus',
      description: 'Strong emphasis on renewable energy with hydrogen and solar projects in Malaysia',
      impact: 'High',
      icon: Zap
    },
    {
      title: 'International Expansion',
      description: 'New market opportunities in Brazil and continued operations in Australia',
      impact: 'Medium',
      icon: Globe
    },
    {
      title: 'Gas Infrastructure',
      description: 'Continued investment in gas projects with supermajor partnerships',
      impact: 'High',
      icon: TrendingUp
    },
    {
      title: 'Chemical Operations',
      description: 'Scheduled maintenance and market positioning in chemicals segment',
      impact: 'Medium',
      icon: AlertCircle
    }
  ];

  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D'];

  const filteredData = selectedCategory === 'all' 
    ? categorizedData 
    : categorizedData.filter(item => item.category === selectedCategory);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-800 to-gray-900 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-white mx-auto mb-4"></div>
          <p className="text-xl">Loading PETRONAS Intelligence Data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-800 to-gray-900 text-white flex items-center justify-center">
        <div className="text-center bg-red-900 p-8 rounded-xl">
          <AlertCircle className="w-16 h-16 mx-auto mb-4" />
          <p className="text-xl font-bold mb-2">Error Loading Data</p>
          <p className="text-gray-300">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-800 to-gray-900 text-white p-3 sm:p-6">
      <div className="max-w-7xl mx-auto">
        <header className="mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-4xl font-bold mb-2 bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
            PETRONAS Market Intelligence Dashboard
          </h1>
          <p className="text-sm sm:text-base text-gray-300">Advanced Analytics & Strategic Insights</p>
        </header>

        {/* Navigation Tabs */}
        <div className="flex gap-2 mb-4 sm:mb-6 flex-wrap overflow-x-auto pb-2">
          {[
            { id: 'overview', icon: Target, label: 'Overview' },
            { id: 'analytics', icon: TrendingUp, label: 'Analytics' },
            { id: 'network', icon: Network, label: 'Network' },
            { id: 'insights', icon: Brain, label: 'Insights' },
            { id: 'timeline', icon: Calendar, label: 'Timeline' }
          ].map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg font-medium transition whitespace-nowrap text-sm sm:text-base ${
                  activeTab === tab.id
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                }`}
              >
                <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
            <div className="bg-gray-800 rounded-xl p-4 sm:p-6 shadow-2xl">
              <h2 className="text-xl sm:text-2xl font-bold mb-4 flex items-center gap-2">
                <Target className="w-5 h-5 sm:w-6 sm:h-6 text-blue-400" />
                <span className="text-sm sm:text-2xl">News Category Distribution</span>
              </h2>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                    outerRadius={60}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-gray-800 rounded-xl p-4 sm:p-6 shadow-2xl">
              <h2 className="text-xl sm:text-2xl font-bold mb-4 flex items-center gap-2">
                <Calendar className="w-5 h-5 sm:w-6 sm:h-6 text-blue-400" />
                <span className="text-sm sm:text-2xl">Activity Timeline</span>
              </h2>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={timelineChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#444" />
                  <XAxis dataKey="date" stroke="#888" tick={{ fontSize: 10 }} />
                  <YAxis stroke="#888" tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: 'none', fontSize: '12px' }} />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                  <Line type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={2} name="News Count" />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-gray-800 rounded-xl p-4 sm:p-6 shadow-2xl lg:col-span-2">
              <h2 className="text-xl sm:text-2xl font-bold mb-4">Key Metrics</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
                <div className="bg-blue-900 rounded-lg p-3 sm:p-4">
                  <div className="text-2xl sm:text-3xl font-bold text-blue-400">{data.length}</div>
                  <div className="text-xs sm:text-sm text-gray-300">Total Articles</div>
                </div>
                <div className="bg-green-900 rounded-lg p-3 sm:p-4">
                  <div className="text-2xl sm:text-3xl font-bold text-green-400">{Object.keys(categoryDistribution).length}</div>
                  <div className="text-xs sm:text-sm text-gray-300">Categories</div>
                </div>
                <div className="bg-purple-900 rounded-lg p-3 sm:p-4">
                  <div className="text-2xl sm:text-3xl font-bold text-purple-400">{categoryDistribution['Renewables'] || 0}</div>
                  <div className="text-xs sm:text-sm text-gray-300">Renewable News</div>
                </div>
                <div className="bg-orange-900 rounded-lg p-3 sm:p-4">
                  <div className="text-2xl sm:text-3xl font-bold text-orange-400">{categoryDistribution['Energy & Gas'] || 0}</div>
                  <div className="text-xs sm:text-sm text-gray-300">Energy News</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Analytics Tab */}
        {activeTab === 'analytics' && (
          <div className="space-y-4 sm:space-y-6">
            <div className="bg-gray-800 rounded-xl p-4 sm:p-6 shadow-2xl">
              <h2 className="text-xl sm:text-2xl font-bold mb-4">Category Analysis</h2>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={pieData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#444" />
                  <XAxis dataKey="name" stroke="#888" tick={{ fontSize: 10 }} angle={-45} textAnchor="end" height={80} />
                  <YAxis stroke="#888" tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: 'none', fontSize: '12px' }} />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                  <Bar dataKey="value" fill="#3b82f6" name="Article Count" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-gray-800 rounded-xl p-4 sm:p-6 shadow-2xl">
              <h2 className="text-xl sm:text-2xl font-bold mb-4">Topic Radar Analysis</h2>
              <ResponsiveContainer width="100%" height={300}>
                <RadarChart data={pieData}>
                  <PolarGrid stroke="#444" />
                  <PolarAngleAxis dataKey="name" stroke="#888" tick={{ fontSize: 10 }} />
                  <PolarRadiusAxis stroke="#888" tick={{ fontSize: 10 }} />
                  <Radar name="Coverage" dataKey="value" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.6} />
                  <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: 'none', fontSize: '12px' }} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Network Tab */}
        {activeTab === 'network' && (
          <div className="bg-gray-800 rounded-xl p-4 sm:p-6 shadow-2xl">
            <h2 className="text-xl sm:text-2xl font-bold mb-4 flex items-center gap-2">
              <Network className="w-5 h-5 sm:w-6 sm:h-6 text-blue-400" />
              <span className="text-sm sm:text-2xl">Topic Co-occurrence Network</span>
            </h2>
            <p className="text-sm sm:text-base text-gray-300 mb-4">
              Bubble size represents the frequency of topics appearing together in news articles.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4 mb-6">
              {Object.keys(topicKeywords).map((topic, idx) => (
                <div key={topic} className="bg-gray-700 rounded-lg p-3 sm:p-4">
                  <div className="font-bold text-base sm:text-lg" style={{ color: COLORS[idx % COLORS.length] }}>
                    {topic}
                  </div>
                  <div className="text-xs sm:text-sm text-gray-300">
                    {categorizedData.filter(item => getTopics(item.title).includes(topic)).length} mentions
                  </div>
                </div>
              ))}
            </div>
            
            {networkData.length > 0 ? (
              <ResponsiveContainer width="100%" height={400}>
                <ScatterChart margin={{ top: 20, right: 20, bottom: 60, left: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#444" />
                  <XAxis 
                    type="number" 
                    dataKey="x" 
                    stroke="#888" 
                    tick={{ fontSize: 10 }}
                    domain={[0, Object.keys(topicKeywords).length - 1]}
                    ticks={Object.keys(topicKeywords).map((_, i) => i)}
                    tickFormatter={(value) => Object.keys(topicKeywords)[value] || ''}
                    angle={-45}
                    textAnchor="end"
                    height={80}
                  />
                  <YAxis 
                    type="number" 
                    dataKey="y" 
                    stroke="#888" 
                    tick={{ fontSize: 10 }}
                    domain={[0, Object.keys(topicKeywords).length - 1]}
                    ticks={Object.keys(topicKeywords).map((_, i) => i)}
                    tickFormatter={(value) => Object.keys(topicKeywords)[value] || ''}
                    width={80}
                  />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#1f2937', border: 'none', fontSize: '12px' }}
                    cursor={{ strokeDasharray: '3 3' }}
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div className="bg-gray-900 p-3 rounded border border-blue-500">
                            <p className="font-bold text-white">{data.topic1} ↔ {data.topic2}</p>
                            <p className="text-blue-400">Co-occurrences: {data.value}</p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Scatter 
                    data={networkData} 
                    fill="#3b82f6"
                    shape="circle"
                  />
                </ScatterChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-center text-gray-400 py-8">
                No topic co-occurrences found in current data
              </div>
            )}
          </div>
        )}

        {/* Insights Tab */}
        {activeTab === 'insights' && (
          <div className="space-y-4 sm:space-y-6">
            <div className="bg-gray-800 rounded-xl p-4 sm:p-6 shadow-2xl">
              <h2 className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6 flex items-center gap-2">
                <Brain className="w-5 h-5 sm:w-6 sm:h-6 text-blue-400" />
                <span className="text-sm sm:text-2xl">Strategic Insights & Recommendations</span>
              </h2>
              <div className="grid gap-3 sm:gap-4">
                {insights.map((insight, idx) => {
                  const Icon = insight.icon;
                  return (
                    <div key={idx} className="bg-gray-700 rounded-lg p-4 sm:p-6 hover:bg-gray-600 transition">
                      <div className="flex items-start gap-3 sm:gap-4">
                        <div className={`p-2 sm:p-3 rounded-lg ${
                          insight.impact === 'High' ? 'bg-red-900' : 'bg-yellow-900'
                        }`}>
                          <Icon className="w-5 h-5 sm:w-6 sm:h-6" />
                        </div>
                        <div className="flex-1">
                          <h3 className="text-lg sm:text-xl font-bold mb-2">{insight.title}</h3>
                          <p className="text-sm sm:text-base text-gray-300 mb-2">{insight.description}</p>
                          <span className={`inline-block px-2 sm:px-3 py-1 rounded-full text-xs sm:text-sm ${
                            insight.impact === 'High' 
                              ? 'bg-red-900 text-red-200' 
                              : 'bg-yellow-900 text-yellow-200'
                          }`}>
                            {insight.impact} Impact
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="bg-gray-800 rounded-xl p-4 sm:p-6 shadow-2xl">
              <h2 className="text-xl sm:text-2xl font-bold mb-4">Future Outlook</h2>
              <div className="space-y-3 sm:space-y-4">
                <div className="bg-gradient-to-r from-green-900 to-green-800 rounded-lg p-3 sm:p-4">
                  <h3 className="font-bold text-base sm:text-lg mb-2">Energy Transition Acceleration</h3>
                  <p className="text-sm sm:text-base text-gray-200">Malaysia's push into hydrogen and solar positions PETRONAS well for the renewable energy future.</p>
                </div>
                <div className="bg-gradient-to-r from-blue-900 to-blue-800 rounded-lg p-3 sm:p-4">
                  <h3 className="font-bold text-base sm:text-lg mb-2">Market Diversification</h3>
                  <p className="text-sm sm:text-base text-gray-200">Expansion into Brazil and continued presence in Australia/Asia provides geographic risk mitigation.</p>
                </div>
                <div className="bg-gradient-to-r from-purple-900 to-purple-800 rounded-lg p-3 sm:p-4">
                  <h3 className="font-bold text-base sm:text-lg mb-2">Technology Innovation</h3>
                  <p className="text-sm sm:text-base text-gray-200">Focus on EV infrastructure and green technology aligns with global sustainability trends.</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Timeline Tab */}
        {activeTab === 'timeline' && (
          <div className="bg-gray-800 rounded-xl p-4 sm:p-6 shadow-2xl">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-0 mb-4 sm:mb-6">
              <h2 className="text-xl sm:text-2xl font-bold">News Timeline</h2>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full sm:w-auto bg-gray-700 text-white px-3 sm:px-4 py-2 rounded-lg border border-gray-600 text-sm sm:text-base"
              >
                <option value="all">All Categories</option>
                {Object.keys(categoryDistribution).map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
            <div className="space-y-3 sm:space-y-4 max-h-96 overflow-y-auto">
              {filteredData.sort((a, b) => b.published - a.published).map((item, idx) => (
                <div key={idx} className="bg-gray-700 rounded-lg p-3 sm:p-4 hover:bg-gray-600 transition">
                  <div className="flex flex-col sm:flex-row justify-between items-start gap-2 mb-2">
                    <span className="text-xs sm:text-sm text-gray-400">
                      {item.published.toLocaleDateString()} {item.published.toLocaleTimeString()}
                    </span>
                    <span className="px-2 py-1 bg-blue-900 text-blue-200 rounded text-xs whitespace-nowrap">
                      {item.category}
                    </span>
                  </div>
                  <h3 className="font-semibold mb-2 text-sm sm:text-base">{item.title}</h3>
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:text-blue-300 text-xs sm:text-sm break-all"
                  >
                    Read Article →
                  </a>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PetronasIntelDashboard;