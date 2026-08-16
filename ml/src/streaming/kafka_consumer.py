import json
import time
import pandas as pd
from typing import Optional
from confluent_kafka import Consumer, KafkaError

class KafkaTransactionConsumer:
    def __init__(self, bootstrap_servers: str, topic: str, group_id: str = "ml-streaming-group"):
        """
        Initializes the Kafka Consumer.
        """
        self.topic = topic
        conf = {
            'bootstrap.servers': bootstrap_servers,
            'group.id': group_id,
            'auto.offset.reset': 'earliest',
            'enable.auto.commit': True
        }
        self.consumer = Consumer(conf)
        self.consumer.subscribe([self.topic])
        print(f"[KafkaConsumer] Subscribed to topic '{self.topic}' at {bootstrap_servers}")

    def consume_batch(self, batch_size: int = 3500, timeout_sec: float = 5.0) -> pd.DataFrame:
        """
        Consumes up to `batch_size` messages or waits for `timeout_sec`, returning them as a DataFrame.
        """
        messages = []
        start_time = time.time()
        
        while len(messages) < batch_size:
            # Poll for message; wait up to the remaining time of our timeout block
            remaining_time = timeout_sec - (time.time() - start_time)
            poll_time = max(0.1, remaining_time) if len(messages) == 0 else max(0.01, remaining_time)
            
            msg = self.consumer.poll(poll_time)
            
            if msg is None:
                # Timeout elapsed during poll
                pass
            elif msg.error():
                if msg.error().code() == KafkaError._PARTITION_EOF:
                    # End of partition
                    pass
                else:
                    print(f"[KafkaConsumer] Error: {msg.error()}")
            else:
                try:
                    data = json.loads(msg.value().decode('utf-8'))
                    messages.append(data)
                except Exception as e:
                    print(f"[KafkaConsumer] Failed to parse message: {e}")
            
            # Break if timeout has been exceeded
            if time.time() - start_time >= timeout_sec:
                break

        if not messages:
            return pd.DataFrame()

        df = pd.DataFrame(messages)
        
        # Map new stream schema to legacy CSV schema
        col_mappings = {
            'txn_id': 'transaction_id',
            'channel': 'transaction_type',
            'account_hash': 'sender_account_id',
            'receiver_ref': 'receiver_account_id',
            'pincode': 'sender_pincode'
        }
        
        # Suppress warnings and errors during rename
        df.rename(columns=col_mappings, inplace=True, errors='ignore')
        
        # Fill strictly required columns for TransactionStore
        if 'receiver_pincode' not in df.columns:
            df['receiver_pincode'] = "Unknown"

        # Parse timestamp string or int to Pandas datetime
        if 'timestamp' in df.columns:
            if pd.api.types.is_numeric_dtype(df['timestamp']):
                df['timestamp'] = pd.to_datetime(df['timestamp'], unit='s')
            else:
                df['timestamp'] = pd.to_datetime(df['timestamp'])
        
        return df

    def close(self):
        self.consumer.close()
