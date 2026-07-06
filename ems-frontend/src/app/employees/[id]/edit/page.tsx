import { EmployeeEditor } from '../../EmployeeEditor';

type EditEmployeePageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function EditEmployeePage({ params }: EditEmployeePageProps) {
  const { id } = await params;
  return <EmployeeEditor employeeId={id} mode="edit" />;
}
