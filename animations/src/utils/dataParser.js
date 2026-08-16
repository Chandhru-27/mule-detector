const MAX_ACCOUNTS = 200;
const API_URL = 'http://127.0.0.1:5000/api/v1/graph-stream';

/*
 * PROPOSED BACKEND API STRUCTURE:
 * Endpoint: GET http://127.0.0.1:5000/api/v1/rings
 * Description: Should return a batch of recent transactions/edges. 
 * The backend should ideally maintain state or accept a list of 'last_seen_tx_ids' 
 * or a '?since_timestamp=' parameter to only return new edges on subsequent calls.
 * 
 * Response Format:
 * {
 *   "transactions": [
 *     {
 *       "id": "tx_123456",
 *       "sender_hash": "acc_abc123...",
 *       "receiver_hash": "acc_xyz789...",
 *       "amount": 50000,
 *       "channel": "UPI",
 *       "timestamp": "2023-10-01T12:00:00Z"
 *     },
 *     ...
 *   ]
 * }
 */

export function streamTransactionsRealtime(onNewData, onComplete) {
  let uniqueAccounts = new Set();
  let accountsData = [];
  let transactionsData = [];
  let isPolling = true;

  const fetchBatch = async () => {
    if (!isPolling) return;

    try {
      const response = await fetch(API_URL);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const rawData = await response.json();
      
      // Determine where the transactions array is based on flexible schemas
      let txList = [];
      if (Array.isArray(rawData)) { // Backend returned a raw array
        txList = rawData;
      } else if (rawData && Array.isArray(rawData.transactions)) { // Proposed structured response
        txList = rawData.transactions;
      } else {
        console.warn('API returned data, but no explicit transactions array was found. Received:', rawData);
      }
      
      if (txList.length > 0) {
        let updateMade = false;
        let latestTx = null;

        txList.forEach(tx => {
          // Allow for flexible property names if backend uses different fields
          const sender = tx.sender_hash || tx.sender || tx.source;
          const receiver = tx.receiver_hash || tx.receiver || tx.target;
          
          // Skip if missing required hash
          if (!sender || !receiver) return;
          
          if (sender && !uniqueAccounts.has(sender) && uniqueAccounts.size < MAX_ACCOUNTS) {
            uniqueAccounts.add(sender);
            accountsData.push({ id: sender, group: 'sender', val: 1 });
            updateMade = true;
          }
          
          if (receiver && !uniqueAccounts.has(receiver) && uniqueAccounts.size < MAX_ACCOUNTS) {
            uniqueAccounts.add(receiver);
            accountsData.push({ id: receiver, group: 'receiver', val: 1 });
            updateMade = true;
          }

          if (uniqueAccounts.has(sender) && uniqueAccounts.has(receiver)) {
            const sNode = accountsData.find(n => n.id === sender);
            const rNode = accountsData.find(n => n.id === receiver);
            if (sNode) sNode.val += 0.2;
            if (rNode) rNode.val += 0.2;

            const txId = tx.id || tx.transaction_id || `${sender}-${receiver}-${tx.timestamp || Date.now()}`;
            if (!transactionsData.find(t => t.id === txId)) {
              transactionsData.push({
                id: txId,
                source: sender,
                target: receiver,
                amount: parseFloat(tx.amount) || 1000, // fallback amount
                channel: tx.channel || tx.transaction_type || 'Unknown',
                timestamp: tx.timestamp || new Date().toISOString()
              });
              latestTx = tx;
              updateMade = true;
            }
          }
        });
        
        if (updateMade) {
          onNewData({
            nodes: [...accountsData],
            links: [...transactionsData]
          }, {
            latestTransaction: latestTx ? (latestTx.channel || latestTx.transaction_type || '-') : '-',
            latestAmount: latestTx ? parseFloat(latestTx.amount) || 0 : 0
          });
        }
      } else {
         console.warn('API returned data, but no valid transactions were parsed. Check if nodes have account hashes.', rawData);
         console.info('Generating mock transaction data to visualise the graph while the backend API is being implemented...');
         
         const mockHashA = 'acc_mock_' + Math.floor(Math.random() * 10);
         const mockHashB = 'acc_mock_' + Math.floor(Math.random() * 10);
         
         if (mockHashA !== mockHashB) {
           if (!uniqueAccounts.has(mockHashA) && uniqueAccounts.size < MAX_ACCOUNTS) {
             uniqueAccounts.add(mockHashA);
             accountsData.push({ id: mockHashA, group: 'sender', val: 1 });
           }
           if (!uniqueAccounts.has(mockHashB) && uniqueAccounts.size < MAX_ACCOUNTS) {
             uniqueAccounts.add(mockHashB);
             accountsData.push({ id: mockHashB, group: 'receiver', val: 1 });
           }
           
           if (uniqueAccounts.has(mockHashA) && uniqueAccounts.has(mockHashB)) {
             const txId = `tx_mock_${Date.now()}`;
             transactionsData.push({
               id: txId,
               source: mockHashA,
               target: mockHashB,
               amount: (Math.random() * 50000 + 1000).toFixed(2),
               channel: ['UPI', 'App', 'Wallet'][Math.floor(Math.random() * 3)],
               timestamp: new Date().toISOString()
             });
             
             onNewData({
               nodes: [...accountsData],
               links: [...transactionsData]
             }, {
               latestTransaction: ['UPI', 'App', 'Wallet'][Math.floor(Math.random() * 3)],
               latestAmount: Math.floor(Math.random() * 50000 + 1000)
             });
           }
         }
      }
    } catch (error) {
      console.error("Error fetching realtime data from backend:", error);
    }

    // Stop and cleanup if we hit maximum logical cap (just to prevent browser overload)
    if (uniqueAccounts.size >= MAX_ACCOUNTS && transactionsData.length > 500) {
      isPolling = false;
      if (onComplete) onComplete();
      return;
    }

    // Poll next batch after 2 seconds
    setTimeout(fetchBatch, 2000);
  };

  fetchBatch();

  // Return a cleanup function if needed (though App.jsx hasn't implemented it yet)
  return () => {
    isPolling = false;
  };
}
