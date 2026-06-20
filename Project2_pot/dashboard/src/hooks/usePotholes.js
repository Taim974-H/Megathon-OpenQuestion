import { useState, useEffect, useCallback, useRef } from 'react'
import { getDangerousPotholes } from '../services/api'

const REFRESH_INTERVAL_MS = 30_000

/**
 * Fetches dangerous potholes and auto-refreshes every 30 seconds.
 *
 * NOTE: Currently reuses the GET /api/potholes/dangerous endpoint for both
 * the map pins and the DangerPanel list because a dedicated
 * GET /api/potholes (all potholes) endpoint is not yet implemented on the
 * backend. Once that endpoint exists, a separate fetch should be added here
 * to populate the full map independently from the top-20 danger list.
 *
 * @returns {{ potholes: object[], loading: boolean, error: string|null, lastUpdated: Date|null, refresh: function }}
 */
export function usePotholes() {
  const [potholes, setPotholes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)
  const intervalRef = useRef(null)

  const fetchPotholes = useCallback(async () => {
    try {
      setError(null)
      const data = await getDangerousPotholes()
      setPotholes(Array.isArray(data) ? data : data.potholes ?? [])
      setLastUpdated(new Date())
    } catch (err) {
      setError(err?.response?.data?.message ?? err.message ?? 'Failed to fetch potholes')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchPotholes()

    intervalRef.current = setInterval(fetchPotholes, REFRESH_INTERVAL_MS)
    return () => clearInterval(intervalRef.current)
  }, [fetchPotholes])

  return { potholes, loading, error, lastUpdated, refresh: fetchPotholes }
}
