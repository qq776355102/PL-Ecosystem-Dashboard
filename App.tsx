
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { AddressInfo } from './types';
import { queryAddressFullData, formatUnits } from './services/blockchain';
import { storage } from './services/storage';
import { DEFAULT_RPC } from './constants';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell 
} from 'recharts';

// Initial data structure matching user's json
const INITIAL_ADDRESS_INFO = {
  "items": [
    {
      "aAddress": "0x999c9cFee1FD3C13cAC00797B48382e5eb2Be12E",
      "log": "10月21号",
      "remark": "",
      "split": "3-7开",
      "derivedAddress": "0x8C666Bf050D99187a65675701FAcC28AaBA46e71"
    },
    {
      "aAddress": "0xBb49265De8DEeA9D56F4Ff928578EaE5c6De4e52",
      "log": "10月22号",
      "remark": "",
      "split": "5-5开",
      "derivedAddress": "0x703112EdB63b86adaFC72c14D4945BEa4649a352"
    },
    {
      "aAddress": "0x549D70813a98ad2fe8ef5C59A24CE4d3Ce4054dA",
      "log": "10月27号",
      "remark": "",
      "split": "",
      "derivedAddress": "0x60deE537A4dE4581D5Dd0F120818d816Bb2E06bc"
    },
    {
      "aAddress": "0xddb6bB0537c4bf7154C1958Ca88bD0B65905D5CF",
      "log": "10月30号",
      "remark": "周丽芳",
      "split": "4-6开",
      "derivedAddress": "0x492c2C6537F36170c4532E43D0056E51a8FfAb99"
    }
  ]
};

const COLORS = ['#6366f1', '#a855f7', '#ec4899', '#f43f5e', '#f97316', '#eab308', '#22c55e'];

const App: React.FC = () => {
  const [data, setData] = useState<AddressInfo[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [rpcUrl, setRpcUrl] = useState(DEFAULT_RPC);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateProgress, setUpdateProgress] = useState(0);
  const [editingRemark, setEditingRemark] = useState<{index: number, value: string} | null>(null);

  // Load initial data
  useEffect(() => {
    const saved = storage.loadData();
    if (saved) {
      setData(saved);
    } else {
      setData(INITIAL_ADDRESS_INFO.items as AddressInfo[]);
    }
    
    const savedRpc = localStorage.getItem('POLYGON_DASHBOARD_RPC');
    if (savedRpc) setRpcUrl(savedRpc);
  }, []);

  const handleRpcChange = (url: string) => {
    setRpcUrl(url);
    localStorage.setItem('POLYGON_DASHBOARD_RPC', url);
  };

  // Optimized Update logic with unique addressing
  const runBatchUpdate = async () => {
    if (isUpdating) return;
    setIsUpdating(true);
    setUpdateProgress(0);

    const uniquePairs = new Map<string, string>();
    data.forEach(item => {
      uniquePairs.set(item.aAddress.toLowerCase(), item.derivedAddress);
    });

    const uniqueAddresses = Array.from(uniquePairs.keys());
    const resultsMap = new Map<string, any>();

    for (let i = 0; i < uniqueAddresses.length; i++) {
      const aAddr = uniqueAddresses[i];
      const dAddr = uniquePairs.get(aAddr)!;
      try {
        const result = await queryAddressFullData(aAddr, dAddr, rpcUrl);
        resultsMap.set(aAddr, result);
      } catch (e) {
        console.error(`Failed to update ${aAddr}`, e);
      }
      setUpdateProgress(Math.round(((i + 1) / uniqueAddresses.length) * 100));
      
      setData(prev => prev.map(item => {
        const res = resultsMap.get(item.aAddress.toLowerCase());
        if (res) {
          return {
            ...item,
            totalStaking: res.totalStaking.toString(),
            airdropEnergyStaking: res.airdropEnergyStaking.toString(),
            bondStaking: res.bondStaking.toString(),
            zhuwangReward: res.zhuwangReward.toString(),
            turbineBalance: res.turbineBalance.toString(),
            lgnsBalance: res.lgnsBalance.toString(),
            slgnsBalance: res.slgnsBalance.toString(),
            lastUpdated: Date.now()
          };
        }
        return item;
      }));
    }

    setData(prev => {
      storage.saveData(prev);
      return prev;
    });
    setIsUpdating(false);
  };

  const handleRemarkChange = (index: number, remark: string) => {
    const newData = [...data];
    newData[index].remark = remark;
    setData(newData);
    storage.saveData(newData);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const json = JSON.parse(event.target?.result as string);
          let items: AddressInfo[] = [];
          if (json.items) items = json.items;
          else if (Array.isArray(json)) items = json;
          setData(items);
          storage.saveData(items);
        } catch (error) { alert('Invalid JSON file'); }
      };
      reader.readAsText(file);
    }
  };

  const filteredData = useMemo(() => {
    return data.filter(item => 
      item.remark.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.aAddress.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [data, searchTerm]);

  const stats = useMemo(() => {
    const uniqueMap = new Map<string, AddressInfo>();
    filteredData.forEach(item => uniqueMap.set(item.aAddress.toLowerCase(), item));

    return Array.from(uniqueMap.values()).reduce((acc, curr) => {
      acc.totalLGNS += BigInt(curr.lgnsBalance || '0');
      acc.totalSLGNS += BigInt(curr.slgnsBalance || '0');
      acc.totalStaked += BigInt(curr.totalStaking || '0');
      acc.totalRewards += BigInt(curr.zhuwangReward || '0');
      acc.totalMintStaked += BigInt(curr.airdropEnergyStaking || '0');
      acc.totalBondStaked += BigInt(curr.bondStaking || '0');
      return acc;
    }, { totalLGNS: 0n, totalSLGNS: 0n, totalStaked: 0n, totalRewards: 0n, totalMintStaked: 0n, totalBondStaked: 0n });
  }, [filteredData]);

  const chartData = useMemo(() => {
    const uniqueMap = new Map<string, AddressInfo>();
    filteredData.forEach(item => uniqueMap.set(item.aAddress.toLowerCase(), item));

    return Array.from(uniqueMap.values()).slice(0, 10).map(item => ({
      name: item.remark || item.aAddress.substring(0, 6),
      staking: parseFloat(formatUnits(item.totalStaking)),
      balance: parseFloat(formatUnits(item.lgnsBalance))
    }));
  }, [filteredData]);

  const maskAddress = (addr: string) => addr ? `${addr.substring(0, 6)}...${addr.substring(addr.length - 4)}` : '';

  return (
    <div className="min-h-screen p-4 md:p-8 space-y-8 text-slate-100 bg-slate-950">
      {/* Header */}
      <header className="flex flex-col xl:flex-row xl:items-center justify-between gap-6 bg-slate-900/40 p-6 rounded-3xl border border-slate-800 backdrop-blur-md shadow-2xl">
        <div className="flex-1">
          <h1 className="text-4xl font-black text-white mb-2 tracking-tighter bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">Polygon Ecosystem Dashboard</h1>
          <p className="text-slate-500 font-medium">Real-time Multicall-optimized Asset Tracking</p>
        </div>
        
        <div className="flex flex-col md:flex-row flex-wrap items-center gap-4">
          <div className="flex flex-col w-full md:w-80">
            <label className="text-[10px] text-slate-500 font-bold uppercase mb-1 ml-1">RPC Network URL</label>
            <input 
              className="bg-slate-950 border border-slate-700 rounded-xl px-4 py-2 text-xs focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
              value={rpcUrl}
              onChange={(e) => handleRpcChange(e.target.value)}
              placeholder="Enter RPC URL..."
            />
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto mt-auto">
            <button 
              onClick={runBatchUpdate}
              disabled={isUpdating}
              className={`flex-1 md:flex-none px-8 py-3 rounded-2xl font-bold transition-all flex items-center justify-center gap-3 ${isUpdating ? 'bg-slate-800 text-slate-500' : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/30'}`}
            >
              {isUpdating ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                  {updateProgress}%
                </>
              ) : 'Batch Update'}
            </button>
            
            <label className="px-5 py-3 bg-slate-800 hover:bg-slate-700 rounded-2xl cursor-pointer transition-all border border-slate-700 text-sm font-bold active:scale-95 shadow-lg">
              Import
              <input type="file" accept=".json" onChange={handleImport} className="hidden" />
            </label>
            
            <button 
              onClick={() => storage.exportToJSON(data)}
              className="px-5 py-3 bg-slate-800 hover:bg-slate-700 rounded-2xl transition-all border border-slate-700 text-sm font-bold active:scale-95 shadow-lg"
            >
              Export
            </button>
          </div>
        </div>
      </header>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {[
          { label: 'Total Staked', value: formatUnits(stats.totalStaked), color: 'text-indigo-400' },
          { label: 'Mint Staked', value: formatUnits(stats.totalMintStaked), color: 'text-cyan-400' },
          { label: 'Bond Staked', value: formatUnits(stats.totalBondStaked), color: 'text-violet-400' },
          { label: 'LGNS Bal', value: formatUnits(stats.totalLGNS), color: 'text-pink-400' },
          { label: 'slgns Bal', value: formatUnits(stats.totalSLGNS, 9), color: 'text-emerald-400' },
          { label: 'Spider Rewards', value: formatUnits(stats.totalRewards), color: 'text-amber-400' },
        ].map((stat, i) => (
          <div key={i} className="bg-slate-900/40 p-5 rounded-3xl border border-slate-800/50 flex flex-col justify-center h-28 hover:border-slate-700 transition-all">
            <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider mb-2">{stat.label}</span>
            <div className="flex items-baseline gap-1">
              <span className={`text-xl font-black ${stat.color}`}>{parseFloat(stat.value).toLocaleString(undefined, {maximumFractionDigits: 2})}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-slate-900/40 p-8 rounded-[2rem] border border-slate-800/50 min-h-[450px] shadow-xl">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-xl font-bold">Staking Distribution</h3>
            <span className="text-[10px] bg-indigo-500/10 text-indigo-400 px-3 py-1 rounded-full font-bold uppercase">Top 10 Unique</span>
          </div>
          <div className="w-full h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="name" stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip 
                  cursor={{fill: '#1e293b'}}
                  contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '16px', padding: '12px' }}
                  itemStyle={{ color: '#f8fafc', fontWeight: 'bold' }}
                />
                <Bar dataKey="staking" fill="#6366f1" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-slate-900/40 p-8 rounded-[2rem] border border-slate-800/50 min-h-[450px] shadow-xl text-center">
          <h3 className="text-xl font-bold mb-8 text-left">Aggregated Assets</h3>
          <div className="w-full h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={[
                    { name: 'Staked', value: parseFloat(formatUnits(stats.totalStaked)) },
                    { name: 'Liquid LGNS', value: parseFloat(formatUnits(stats.totalLGNS)) },
                    { name: 'Liquid slgns', value: parseFloat(formatUnits(stats.totalSLGNS)) },
                  ]}
                  cx="50%" cy="50%" innerRadius={80} outerRadius={120} paddingAngle={8} dataKey="value" stroke="none"
                >
                  {COLORS.map((color, index) => <Cell key={`cell-${index}`} fill={color} />)}
                </Pie>
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '16px' }}
                />
                <Legend verticalAlign="bottom" height={36}/>
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Table Section */}
      <div className="bg-slate-900/40 rounded-[2.5rem] border border-slate-800/50 overflow-hidden shadow-2xl">
        <div className="p-8 border-b border-slate-800 bg-slate-900/60 flex flex-col md:flex-row gap-6 items-center justify-between">
          <div>
            <h3 className="text-2xl font-black">Address Registry</h3>
            <p className="text-sm text-slate-500 mt-1 font-medium">{filteredData.length} Records Detected</p>
          </div>
          <div className="relative w-full md:w-1/3">
            <input 
              type="text"
              placeholder="Search by remark or address..."
              className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-12 py-3.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm shadow-inner"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <svg className="absolute left-4 top-4 w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[1300px]">
            <thead>
              <tr className="bg-slate-950/50 text-slate-500 text-[10px] font-black uppercase tracking-widest text-center border-b border-slate-800">
                <th className="px-8 py-6 text-left">Identity / Remark</th>
                <th className="px-8 py-6 text-left">A-Address (Main)</th>
                <th className="px-8 py-6 text-left">Derived (Safe)</th>
                <th className="px-8 py-6">Total Stake</th>
                <th className="px-8 py-6">Mint Stake</th>
                <th className="px-8 py-6">Bond Stake</th>
                <th className="px-8 py-6 text-amber-500">Spider Rewards</th>
                <th className="px-8 py-6">LGNS Bal</th>
                <th className="px-8 py-6">slgns Bal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {filteredData.map((item, idx) => {
                const isRepeat = filteredData.slice(0, idx).some(prev => prev.aAddress.toLowerCase() === item.aAddress.toLowerCase());
                
                return (
                  <tr key={`${item.aAddress}-${idx}`} className={`hover:bg-indigo-500/5 transition-colors group text-center ${isRepeat ? 'opacity-70 grayscale-[0.3]' : ''}`}>
                    <td className="px-8 py-6 text-left">
                      {editingRemark?.index === idx ? (
                        <input 
                          className="bg-slate-950 border border-indigo-500 rounded-xl px-3 py-2 text-sm outline-none w-full shadow-lg"
                          value={editingRemark.value}
                          autoFocus
                          onBlur={() => {
                            handleRemarkChange(idx, editingRemark.value);
                            setEditingRemark(null);
                          }}
                          onChange={(e) => setEditingRemark({ ...editingRemark, value: e.target.value })}
                          onKeyDown={(e) => e.key === 'Enter' && setEditingRemark(null)}
                        />
                      ) : (
                        <div 
                          className="text-indigo-300 cursor-pointer hover:text-indigo-100 text-sm font-bold transition-colors"
                          onClick={() => setEditingRemark({ index: idx, value: item.remark })}
                        >
                          {item.remark || <span className="text-slate-700 italic font-normal">Add remark...</span>}
                        </div>
                      )}
                      <div className="text-[10px] text-slate-600 mt-1.5 flex items-center gap-2 font-bold">
                        {item.log}
                        {isRepeat && <span className="bg-amber-500/10 text-amber-500/80 px-2 py-0.5 rounded-full border border-amber-500/20 tracking-tighter">DUPLICATE</span>}
                      </div>
                    </td>
                    <td className="px-8 py-6 font-mono text-[10px] text-slate-400 text-left">
                      <div className="bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800 w-fit">{item.aAddress}</div>
                    </td>
                    <td className="px-8 py-6 font-mono text-[10px] text-slate-500 text-left">
                      <div className="hover:text-slate-300 transition-colors">{maskAddress(item.derivedAddress)}</div>
                    </td>
                    <td className="px-8 py-6">
                      <div className="text-sm font-black text-white">{parseFloat(formatUnits(item.totalStaking)).toLocaleString(undefined, {minimumFractionDigits: 2})}</div>
                    </td>
                    <td className="px-8 py-6">
                      <div className="text-sm font-black text-cyan-500">{parseFloat(formatUnits(item.airdropEnergyStaking)).toLocaleString(undefined, {minimumFractionDigits: 2})}</div>
                    </td>
                    <td className="px-8 py-6">
                      <div className="text-sm font-black text-violet-500">{parseFloat(formatUnits(item.bondStaking)).toLocaleString(undefined, {minimumFractionDigits: 2})}</div>
                    </td>
                    <td className="px-8 py-6">
                      <div className="text-sm font-black text-amber-500">{parseFloat(formatUnits(item.zhuwangReward)).toLocaleString(undefined, {minimumFractionDigits: 2})}</div>
                    </td>
                    <td className="px-8 py-6">
                      <div className="text-sm font-black text-pink-500">{parseFloat(formatUnits(item.lgnsBalance)).toLocaleString(undefined, {minimumFractionDigits: 2})}</div>
                    </td>
                    <td className="px-8 py-6">
                      <div className="text-sm font-black text-emerald-500">{parseFloat(formatUnits(item.slgnsBalance)).toLocaleString(undefined, {minimumFractionDigits: 2})}</div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default App;
