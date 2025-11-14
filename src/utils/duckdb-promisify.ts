// src/utils/duckdb-promisify.ts
import { Database } from 'duckdb';

export function promisifyRun(connection: any, sql: string, params?: any[]): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (params && params.length > 0) {
      connection.run(sql, params, (err: any) => {
        if (err) reject(err);
        else resolve();
      });
    } else {
      connection.run(sql, (err: any) => {
        if (err) reject(err);
        else resolve();
      });
    }
  });
}

export function promisifyAll<T = any>(connection: any, sql: string, params?: any[]): Promise<T[]> {
  return new Promise<T[]>((resolve, reject) => {
    if (params && params.length > 0) {
      connection.all(sql, params, (err: any, rows: T[]) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    } else {
      connection.all(sql, (err: any, rows: T[]) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    }
  });
}

export function promisifyGet<T = any>(connection: any, sql: string, params?: any[]): Promise<T | null> {
  return new Promise<T | null>((resolve, reject) => {
    if (params && params.length > 0) {
      connection.get(sql, params, (err: any, row: T) => {
        if (err) reject(err);
        else resolve(row || null);
      });
    } else {
      connection.get(sql, (err: any, row: T) => {
        if (err) reject(err);
        else resolve(row || null);
      });
    }
  });
}