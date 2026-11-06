import React from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  getTemplates,
  getCases,
  type TemplateDefinition,
  type CaseFile,
} from '@/lib/api'

export interface SchemaSummary {
  template: TemplateDefinition
  versions: TemplateDefinition[]
  total: number
  awaiting: number
}

export function useSchemaSummaries() {
  const templatesQuery = useQuery({ queryKey: ['templates'], queryFn: getTemplates })
  const casesQuery = useQuery({
    queryKey: ['cases'],
    queryFn: () => getCases({ limit: 100 }),
  })

  const schemas = React.useMemo<SchemaSummary[]>(() => {
    const grouped: Record<string, TemplateDefinition[]> = {}
    templatesQuery.data?.forEach((tpl) => {
      const list = grouped[tpl.template_id] || (grouped[tpl.template_id] = [])
      list.push(tpl)
    })
    const byTemplate = groupCases(casesQuery.data)
    return Object.values(grouped)
      .map((versions) => {
        const latest = [...versions].sort(
          (a, b) => b.template_version - a.template_version,
        )[0]
        const list = byTemplate[latest.template_id] || []
        return {
          template: latest,
          versions,
          total: list.length,
          awaiting: list.filter(
            (c) => !['approved', 'completed', 'failed'].includes(c.status),
          ).length,
        }
      })
      .sort((a, b) => b.awaiting - a.awaiting || b.total - a.total)
  }, [templatesQuery.data, casesQuery.data])

  const casesByTemplate = React.useMemo(
    () => groupCases(casesQuery.data),
    [casesQuery.data],
  )

  const totalAwaiting = React.useMemo(
    () =>
      (casesQuery.data || []).filter(
        (c) => !['approved', 'completed', 'failed'].includes(c.status),
      ).length,
    [casesQuery.data],
  )

  return {
    templates: templatesQuery.data,
    cases: casesQuery.data,
    schemas,
    casesByTemplate,
    totalAwaiting,
    isLoading: templatesQuery.isLoading || casesQuery.isLoading,
  }
}

function groupCases(cases: CaseFile[] | undefined) {
  const grouped: Record<string, CaseFile[]> = {}
  cases?.forEach((c) => {
    const list = grouped[c.template_id] || (grouped[c.template_id] = [])
    list.push(c)
  })
  return grouped
}
