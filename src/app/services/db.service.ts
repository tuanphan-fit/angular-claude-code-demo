import { Injectable } from '@angular/core';
import { ChallengeResult } from '../models/pitch-challenge.model';

@Injectable({
  providedIn: 'root'
})
export class DbService {
  private dbName = 'pitch-detector-db';
  private storeName = 'challenge-results';
  private db: IDBDatabase | null = null;

  constructor() {
    // Initialize the database when the service is created
    // We'll use a try-catch to handle errors gracefully
    try {
      this.initDb();
    } catch (error) {
      console.error('Failed to initialize IndexedDB:', error);
    }
  }

  private initDb(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.db) {
        resolve();
        return;
      }

      const request = indexedDB.open(this.dbName, 1);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: 'id', autoIncrement: true });
          store.createIndex('date', 'date', { unique: false });
        }
      };

      request.onsuccess = (event) => {
        this.db = (event.target as IDBOpenDBRequest).result;
        resolve();
      };

      request.onerror = (event) => {
        console.error('IndexedDB error:', event);
        reject('Error opening database');
      };
    });
  }

  async saveResult(result: ChallengeResult): Promise<number> {
    await this.initDb();
    
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject('Database not initialized');
        return;
      }

      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      
      // Ensure date is properly serializable
      const resultToSave = {
        ...result,
        date: result.date instanceof Date ? result.date : new Date(result.date)
      };

      const request = store.add(resultToSave);

      request.onsuccess = (event) => {
        resolve(request.result as number);
      };

      request.onerror = (event) => {
        console.error('Error saving result:', event);
        reject('Error saving result');
      };
    });
  }

  async getResults(): Promise<ChallengeResult[]> {
    await this.initDb();
    
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject('Database not initialized');
        return;
      }

      const transaction = this.db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.getAll();

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = (event) => {
        console.error('Error retrieving results:', event);
        reject('Error retrieving results');
      };
    });
  }

  async getResultById(id: number): Promise<ChallengeResult | null> {
    await this.initDb();
    
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject('Database not initialized');
        return;
      }

      const transaction = this.db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.get(id);

      request.onsuccess = () => {
        resolve(request.result || null);
      };

      request.onerror = (event) => {
        console.error('Error retrieving result:', event);
        reject('Error retrieving result');
      };
    });
  }

  async deleteResult(id: number): Promise<void> {
    await this.initDb();
    
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject('Database not initialized');
        return;
      }

      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.delete(id);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = (event) => {
        console.error('Error deleting result:', event);
        reject('Error deleting result');
      };
    });
  }
}