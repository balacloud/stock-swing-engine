import { useState, useEffect } from 'react'
import { useQuery } from 'react-query'
import axios from 'axios'
import { AdvancedRealTimeChart } from 'react-ts-tradingview-widgets'
import { detect } from 'candlestick'

const DISCLAIMER = "NOT financial advice. Data-driven only. Markets are risky."

export default function App() {
  const [symbol, setSymbol] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [savedKey, setSavedKey] = useState('')
  const [querySymbol, setQuerySymbol] = useState('')

  useEffect(() => {
    const key = localStorage.getItem('alphaKey')
    if (key) setSavedKey(key)
  }, [])

  const saveKey = () => {
    localStorage.setItem('alphaKey', apiKey)
    setSavedKey(apiKey)
  }

  const fetchAll = async (sym) => {
    if (!savedKey) throw new Error('API key required')
    const base = `https://www.alphavantage.co/query?apikey=${savedKey}`
    try {
      const [daily, rsi, macd, obv, adx, bbands, overview, earnings, news, sector, globalQuote, spGlobalQuote, spSMA, options] = await Promise.all([
        axios.get(`${base}&function=TIME_SERIES_DAILY_ADJUSTED&symbol=${sym}&outputsize=compact`),
        axios.get(`${base}&function=RSI&symbol=${sym}&interval=daily&time_period=14&series_type=close`),
        axios.get(`${base}&function=MACD&symbol=${sym}&interval=daily`),
        axios.get(`${base}&function=OBV&symbol=${sym}&interval=daily`),
        axios.get(`${base}&function=ADX&symbol=${sym}&interval=daily&time_period=14`),
        axios.get(`${base}&function=BBANDS&symbol=${sym}&interval=daily&time_period=20`),
        axios.get(`${base}&function=OVERVIEW&symbol=${sym}`),
        axios.get(`${base}&function=EARNINGS&symbol=${sym}`),
        axios.get(`${base}&function=NEWS_SENTIMENT&tickers=${sym}&limit=20`),
        axios.get(`${base}&function=SECTOR`),
        axios.get(`${base}&function=GLOBAL_QUOTE&symbol=${sym}`),
        axios.get(`${base}&function=GLOBAL_QUOTE&symbol=^GSPC`),
        axios.get(`${base}&function=SMA&symbol=^GSPC&interval=daily&time_period=200&series_type=close`),
        axios.get(`${base}&function=HISTORICAL_OPTIONS&symbol=${sym}&date=latest`)
      ])
      return { daily: daily.data, rsi: rsi.data, macd: macd.data, obv: obv.data, adx: adx.data, bbands: bbands.data, overview: overview.data, earnings: earnings.data, news: news.data, sector: sector.data, globalQuote: globalQuote.data, spGlobalQuote: spGlobalQuote.data, spSMA: spSMA.data, options: options.data }
    } catch (fetchError) {
      console.error('API Fetch Error:', fetchError.message, { symbol: sym });
      throw new Error(`Failed to fetch data: ${fetchError.message}. Check console for details.`);
    }
  }

  const { data, isLoading, error } = useQuery(['all', querySymbol], () => fetchAll(querySymbol), { enabled: !!querySymbol && !!savedKey, cacheTime: 300000 })

  const handleSearch = (e) => {
    e.preventDefault()
    setQuerySymbol(symbol.toUpperCase())
  }

  const latest = (obj, key) => {
    const ts = obj?.[`Technical Analysis: ${key}`] || obj?.['Time Series (Daily)'] || {}
    const dates = Object.keys(ts).sort().reverse()
    return { cur: ts[dates[0]] || {}, prev: ts[dates[1]] || {}, prev2: ts[dates[2]] || {} }
  }

  const detectPattern = (ohlc) => {
    const candles = Object.entries(ohlc || {}).slice(0, 5).map(([date, v]) => ({
      open: parseFloat(v?.['1. open'] || 0),
      high: parseFloat(v?.['2. high'] || 0),
      low: parseFloat(v?.['3. low'] || 0),
      close: parseFloat(v?.['4. close'] || 0)
    })).reverse()
    try {
      const patterns = detect(candles)
      return patterns.length ? patterns.join(', ') : 'None'
    } catch (err) {
      console.error('Pattern Detection Error:', err.message);
      return 'Error detecting patterns'
    }
  }

  const analyze = (d) => {
    try {
      if (!d || !d.daily) {
        console.warn('Missing daily data');
        return { error: 'Missing essential data for analysis' }
      }

      const price = parseFloat(d.globalQuote?.['Global Quote']?.['05. price'] || 0);
      const sp500Price = parseFloat(d.spGlobalQuote?.['Global Quote']?.['05. price'] || 0);
      const sp200SMA = parseFloat(latest(d.spSMA, 'SMA').cur.SMA || 0);
      const marketUp = sp500Price > sp200SMA;

      const dailyTS = d.daily['Time Series (Daily)'] || {}
      const pattern = detectPattern(dailyTS)

      const rsi = parseFloat(latest(d.rsi, 'RSI').cur.RSI || 0)
      const macd = latest(d.macd, 'MACD')
      const macdBull = parseFloat(macd.cur['MACD'] || 0) > parseFloat(macd.cur['MACD_Signal'] || 0) && parseFloat(macd.prev['MACD'] || 0) <= parseFloat(macd.prev['MACD_Signal'] || 0)
      const adx = parseFloat(latest(d.adx, 'ADX').cur.ADX || 0)
      const bb = latest(d.bbands, 'BBANDS')
      const onLowerBand = parseFloat(dailyTS[Object.keys(dailyTS)[0]]?.['4. close'] || 0) <= parseFloat(bb.cur['Lower Band'] || 0)

      const volAvg20 = Object.values(dailyTS).slice(0,20).reduce((a,v) => a + parseFloat(v?.['6. volume'] || 0), 0)/20 || 0
      const volToday = parseFloat(Object.values(dailyTS)[0]?.['6. volume'] || 0)
      const volSurge = volToday > volAvg20 * 1.5

      const obvCur = parseFloat(latest(d.obv, 'OBV').cur.OBV || 0)
      const obvPrev = parseFloat(latest(d.obv, 'OBV').prev.OBV || 0)
      const obvBull = obvCur > obvPrev

      const sma50 = parseFloat(d.overview?.['50DayMovingAverage'] || 0)
      const sma200 = parseFloat(d.overview?.['200DayMovingAverage'] || 0)
      const aboveMA = price > sma50 && sma50 > sma200

      const earningsQoQ = parseFloat(d.overview?.QuarterlyEarningsGrowthYOY || 0)
      const roe = parseFloat(d.overview?.ReturnOnEquityTTM || 0)
      const analystTarget = parseFloat(d.overview?.AnalystTargetPrice || price * 1.35)

      const sentiments = d.news?.feed?.map(n => n.ticker_sentiment?.find(t => t.ticker === querySymbol)?.ticker_sentiment_score) || []
      const avgSentiment = sentiments.length ? sentiments.reduce((a,b) => a + parseFloat(b||0), 0)/sentiments.length : 0

      const sectorRank = d.sector?.['Rank A: Real-Time Performance']?.[d.overview?.Sector] || 'N/A'

      const oiData = d.options?.options?.[0]?.calls || []
      const oiChange = oiData.length ? oiData.reduce((a,c) => a + parseInt(c.open_interest || 0), 0) : 0

      let score = 0
      if (rsi < 35) score += 12
      if (macdBull) score += 15
      if (adx > 25) score += 10
      if (onLowerBand) score += 8
      if (volSurge && obvBull) score += 12
      if (aboveMA) score += 10
      if (earningsQoQ > 0.25) score += 10
      if (avgSentiment >= 0.5) score += 8
      if (marketUp && sectorRank.includes('Top')) score += 15

      const verdict = score >= 85 ? 'STRONG BUY' : score >= 70 ? 'BUY' : score >= 50 ? 'HOLD' : score >= 30 ? 'SELL' : 'STRONG SELL'
      const entry = price * 0.94
      const exit = price * 1.35
      const potential = ((analystTarget - entry)/entry*100).toFixed(1)

      return { score, verdict, rsi, macdBull, adx, pattern, volSurge, obvBull, aboveMA, earningsQoQ: (earningsQoQ*100).toFixed(1), avgSentiment: avgSentiment.toFixed(2), marketUp, sectorRank, oiChange, entry, exit, potential, price: price.toFixed(2) }
    } catch (analyzeError) {
      console.error('Analysis Error:', analyzeError.message, { dataKeys: Object.keys(d || {}) });
      return { error: `Analysis failed: ${analyzeError.message}. Data may be incomplete.` }
    }
  }

  const analysis = data ? analyze(data) : null

  return (
    <div style={{ padding: '2rem', maxWidth: '1300px', margin: 'auto' }}>
      <h1>Stock Swing Trade Engine</h1>
      <p><strong>1-2 month swings | 30-40% target | 100% data-driven</strong></p>
      <p style={{color:'red'}}>{DISCLAIMER}</p>

      {!savedKey ? (
        <div style={{background:'#fff', padding:'1rem', border:'1px solid #ddd'}}>
          <p>Get free key → <a href="https://www.alphavantage.co/support/#api-key" target="_blank">Alpha Vantage</a></p>
          <input value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="API key" style={{width:'320px'}} />
          <button onClick={saveKey}>Save</button>
        </div>
      ) : (
        <>
          <form onSubmit={handleSearch}>
            <input value={symbol} onChange={e => setSymbol(e.target.value)} placeholder="Ticker" required />
            <button type="submit">Analyze</button>
          </form>
          <p>Key saved – <button onClick={() => {localStorage.removeItem('alphaKey'); setSavedKey('')}}>Change</button></p>
        </>
      )}

      {isLoading && <p>Loading 13 data sources...</p>}
      {error && <p>Error: {error.message} (check key / rate limit / network)</p>}

      {analysis ? (
        analysis.error ? (
          <p style={{color: 'red'}}>Error during analysis: {analysis.error}. Please try again or check console for details.</p>
        ) : (
          <>
            <h2>{querySymbol} – Score: <span className="score" style={{color: analysis.score>=70?'green':'red'}}>{analysis.score}/100</span> → {analysis.verdict}</h2>
            <p>Price: ${analysis.price}</p>

            <h3>Technicals (35 pts)</h3>
            <p>RSI: {analysis.rsi.toFixed(1)} | MACD bullish: {analysis.macdBull?'✓':'✗'} | ADX: {analysis.adx.toFixed(1)} | Pattern: {analysis.pattern}</p>

            <h3>Volume & Price Action (20 pts)</h3>
            <p>Volume surge: {analysis.volSurge?'✓':'✗'} | OBV bullish: {analysis.obvBull?'✓':'✗'}</p>

            <h3>Trend & Market (25 pts)</h3>
            <p>Above MAs: {analysis.aboveMA?'✓':'✗'} | S&P uptrend: {analysis.marketUp?'✓':'✗'} | Sector: {analysis.sectorRank}</p>

            <h3>Fundamentals & Sentiment (20 pts)</h3>
            <p>Earnings QoQ: {analysis.earningsQoQ}% | Sentiment: {analysis.avgSentiment}</p>

            <h3>Open Interest</h3>
            <p>Total calls OI: {analysis.oiChange.toLocaleString()}</p>

            {analysis.verdict.includes('BUY') && (
              <>
                <h3>Swing Setup</h3>
                <p>Entry ≈ ${analysis.entry.toFixed(2)}</p>
                <p>Target ≈ ${analysis.exit.toFixed(2)} (+35%)</p>
                <p>Analyst upside: {analysis.potential}%</p>
              </>
            )}

            <h3>Chart</h3>
            <div style={{height:'600px'}}><AdvancedRealTimeChart symbol={querySymbol} interval="D" autosize /></div>
          </>
        )
      ) : null}
    </div>
  )
}