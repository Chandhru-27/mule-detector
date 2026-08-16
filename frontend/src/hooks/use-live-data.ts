import { useState, useEffect } from "react";

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

export function useLiveMetrics() {
  const [metrics, setMetrics] = useState<any>(null);

  useEffect(() => {
    const evtSource = new EventSource(`${BASE_URL}/v1/stream/metrics`);
    
    evtSource.onmessage = (event) => {
      try {
        const liveData = JSON.parse(event.data);
        setMetrics(liveData);
      } catch (err) {
        console.error('Failed to parse SSE event data', err);
      }
    };

    evtSource.onerror = (err) => {
      console.error('EventSource failed:', err);
    };

    return () => {
      evtSource.close();
    };
  }, []);

  return metrics;
}

export function useLiveAlertsQueue() {
  const [alerts, setAlerts] = useState<any[]>([]);

  useEffect(() => {
    const evtSource = new EventSource(`${BASE_URL}/v1/stream/alerts`);
    
    evtSource.onmessage = (event) => {
      try {
        const newAlert = JSON.parse(event.data);
        setAlerts((prev) => [newAlert, ...prev].slice(0, 50)); // keep last 50
      } catch (err) {
        console.error('Failed to parse SSE event data', err);
      }
    };

    evtSource.onerror = (err) => {
      console.error('Alert EventSource failed:', err);
    };

    return () => {
      evtSource.close();
    };
  }, []);

  return alerts;
}

export function usePulse(interval: number = 3000) {
  const [pulse, setPulse] = useState(false);
  useEffect(() => {
    const timer = setInterval(() => {
      setPulse(true);
      setTimeout(() => setPulse(false), 500);
    }, interval);
    return () => clearInterval(timer);
  }, [interval]);
  return pulse;
}

export function useLiveCounter(baseValue: number, variance: number = 10, interval: number = 3000) {
  const [value, setValue] = useState(baseValue);
  
  useEffect(() => {
    // Reset value if baseValue changes
    setValue(baseValue);
    
    // Update value randomly within variance
    const timer = setInterval(() => {
      const change = Math.floor((Math.random() * variance * 2) - variance);
      setValue((prev) => Math.max(0, prev + change));
    }, interval);
    
    return () => clearInterval(timer);
  }, [baseValue, variance, interval]);
  
  return value;
}
