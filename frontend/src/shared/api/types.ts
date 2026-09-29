import type { components, paths } from './schema'

type S = components['schemas']

type Json<T> = T extends { content: { 'application/json': infer Body } } ? Body : never
type Success<R> = R extends { 200: infer Ok }
  ? Ok
  : R extends { 201: infer Created }
    ? Created
    : R extends { 202: infer Accepted }
      ? Accepted
      : never
type Operation<P extends keyof paths, M extends keyof paths[P]> = paths[P][M]

// Response body of an operation straight from the contract: a drift between the YAML and a screen fails tsc.
export type Res<P extends keyof paths, M extends keyof paths[P]> =
  Operation<P, M> extends { responses: infer R } ? Json<Success<R>> : never

export type Problem = S['Problem']
export type ProvenanceStatus = S['ProvenanceStatus']
export type Provenance = S['Provenance']
export type Source = S['Source']
export type VersionStamp = S['VersionStamp']

export type User = S['User']
export type Role = S['Role']
export type TokenPair = S['TokenPair']
export type LoginRequest = S['LoginRequest']
export type RegisterRequest = S['RegisterRequest']
export type SystemVersion = S['SystemVersion']

export type ObjectTypeKey = S['ObjectTypeKey']
export type ObjectType = S['ObjectType']
export type ParameterDef = S['ParameterDef']
export type ParameterGroup = S['ParameterGroup']
export type Norm = S['Norm']

export type Product = S['Product']
export type ProductDetail = S['ProductDetail']
export type ProductList = S['ProductList']
export type ProductStatus = S['ProductStatus']
export type Badge = S['Badge']
export type Spec = S['Spec']
export type SpecGroup = S['SpecGroup']
export type CatalogFacets = S['CatalogFacets']
export type Facet = S['Facet']
export type CompareRequest = S['CompareRequest']
export type CompareResult = S['CompareResult']

export type Project = S['Project']
export type ProjectList = S['ProjectList']
export type ProjectCreate = S['ProjectCreate']
export type ProjectUpdate = S['ProjectUpdate']
export type ProjectStatus = S['ProjectStatus']
export type ProjectParam = S['ProjectParam']
export type ProjectParams = S['ProjectParams']
export type ParamUpsert = S['ParamUpsert']
export type ParamHistoryItem = S['ParamHistoryItem']
export type ImportResult = S['ImportResult']
export type ImportApply = S['ImportApply']
export type ValidationReport = S['ValidationReport']
export type ValidationIssue = S['ValidationIssue']
export type DataQualityReport = S['DataQualityReport']
export type DataQualitySummary = S['DataQualitySummary']
export type ProcessDemand = S['ProcessDemand']
export type ProcessDemandList = S['ProcessDemandList']
export type AuditEvent = S['AuditEvent']
export type AuditList = S['AuditList']

export type Layout = S['Layout']
export type LayoutTemplate = S['LayoutTemplate']
export type LayoutGenerateRequest = S['LayoutGenerateRequest']
export type Zone = S['Zone']
export type ZoneKind = S['ZoneKind']
export type LayoutNode = S['LayoutNode']
export type LayoutEdge = S['LayoutEdge']

export type MatchingResult = S['MatchingResult']
export type MatchingRunRequest = S['MatchingRunRequest']
export type ProcessMatching = S['ProcessMatching']
export type Candidate = S['Candidate']
export type CandidateStatus = S['CandidateStatus']
export type Reason = S['Reason']

export type Scenario = S['Scenario']
export type ScenarioKind = S['ScenarioKind']
export type ScenarioCreate = S['ScenarioCreate']
export type ScenarioUpdate = S['ScenarioUpdate']
export type ScenarioItem = S['ScenarioItem']
export type ScenarioItemWrite = S['ScenarioItemWrite']
export type Financing = S['Financing']
export type NormOverride = S['NormOverride']
export type CountResult = S['CountResult']

export type CalculationRun = S['CalculationRun']
export type CalculationTrace = S['CalculationTrace']
export type TraceItem = S['TraceItem']
export type TraceInput = S['TraceInput']
export type CostItem = S['CostItem']
export type CostBreakdown = S['CostBreakdown']
export type EffectItem = S['EffectItem']
export type CashflowPoint = S['CashflowPoint']
export type Metrics = S['Metrics']
export type Interpretation = S['Interpretation']
export type Risk = S['Risk']
export type SizingResult = S['SizingResult']
export type Narrative = S['Narrative']
export type ComparisonTable = S['ComparisonTable']
export type SensitivityRequest = S['SensitivityRequest']
export type SensitivityResult = S['SensitivityResult']
export type MonteCarloRequest = S['MonteCarloRequest']
export type MonteCarloResult = S['MonteCarloResult']
export type SurveyPriorities = S['SurveyPriorities']

export type Job = S['Job']
export type SimulationReplay = S['SimulationReplay']
export type SimulationHeatmap = S['SimulationHeatmap']
export type TimelinePoint = S['TimelinePoint']
export type SimEvent = S['SimEvent']

export type Report = S['Report']
export type ReportFormat = S['ReportFormat']
export type ReportSection = S['ReportSection']
export type LayoutPlan = S['LayoutPlan']
export type Rack = S['Rack']
// What the 2D map and the 3D twin draw: the project layout or the copy a simulation run kept (LayoutPlan).
export type LayoutGeometry = Pick<LayoutPlan, 'width_m' | 'height_m' | 'zones' | 'nodes' | 'edges'> & {
  racks?: Rack[]
  id?: string
  version?: number
  generator?: Layout['generator']
}

export type ProductWrite = S['ProductWrite']
export type SpecWrite = S['SpecWrite']
export type SourceWrite = S['SourceWrite']
export type SourceKind = S['SourceKind']
export type NormCategory = S['NormCategory']
export type NormSet = S['NormSet']
export type NormSetCreate = S['NormSetCreate']
export type AdminUserUpdate = S['AdminUserUpdate']
export type AnalyticsOverview = S['AnalyticsOverview']
export type UserList = S['UserList']
export type AdminParameterDefault = S['AdminParameterDefault']
export type ParameterDefaultWrite = S['ParameterDefaultWrite']
export type RegistrySource = S['RegistrySource']
export type SourceList = S['SourceList']
export type SourceUpdate = S['SourceUpdate']
export type SourceFreshness = S['SourceFreshness']
export type SolutionType = S['SolutionType']
export type Industry = S['Industry']

export type Organization = S['Organization']
export type OrganizationDetail = S['OrganizationDetail']
export type OrganizationMember = S['OrganizationMember']
export type OrganizationInvitation = S['OrganizationInvitation']
export type OrganizationRole = S['OrganizationRole']
export type IncomingInvitation = S['IncomingInvitation']
