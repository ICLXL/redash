import { head, includes, trim, template, values } from "lodash";
import React from "react";
import PropTypes from "prop-types";

import { currentUser } from "@/services/auth";
import { Layout } from "@/components/ApplicationArea";
import navigateTo from "@/components/ApplicationArea/navigateTo";
import notification from "@/services/notification";
import { Alert as AlertService } from "@/services/alert";
import { Query as QueryService } from "@/services/query";

import LoadingState from "@/components/items-list/components/LoadingState";
import MenuButton from "./components/MenuButton";
import AlertView from "./AlertView";
import AlertEdit from "./AlertEdit";
import AlertNew from "./AlertNew";

import PromiseRejectionError from "@/lib/promise-rejection-error";

const MODES = {
  NEW: 0,
  VIEW: 1,
  EDIT: 2,
};

const defaultNameBuilder = template("<%= query.name %>: <%= options.column %> <%= options.op %> <%= options.value %>");

export function getDefaultName(alert) {
  if (!alert.query) {
    return "New Alert";
  }
  return defaultNameBuilder(alert);
}

class AlertPage extends React.Component {
  static propTypes = {
    mode: PropTypes.oneOf(values(MODES)),
    alertId: PropTypes.string,
  };

  static defaultProps = {
    mode: null,
    alertId: null,
  };

  _isMounted = false;

  state = {
    alert: null,
    queryResult: null,
    pendingRearm: null,
    canEdit: false,
    mode: null,
  };

  componentDidMount() {
    this._isMounted = true;
    const { mode } = this.props;
    this.setState({ mode });

    if (mode === MODES.NEW) {
      this.setState({
        alert: new AlertService({
          options: {
            op: ">",
            value: 1,
            muted: false,
          },
        }),
        pendingRearm: 0,
        canEdit: true,
      });
    } else {
      const { alertId } = this.props;
      AlertService.get({ id: alertId })
        .$promise.then(alert => {
          if (this._isMounted) {
            const canEdit = currentUser.canEdit(alert);

            // force view mode if can't edit
            if (!canEdit) {
              this.setState({ mode: MODES.VIEW });
              notification.warn(
                "You cannot edit this alert",
                "You do not have sufficient permissions to edit this alert, and have been redirected to the view-only page.",
                { duration: 0 }
              );
            }

            this.setState({ alert, canEdit, pendingRearm: alert.rearm });
            this.onQuerySelected(alert.query);
          }
        })
        .catch(err => {
          if (this._isMounted) {
            throw new PromiseRejectionError(err);
          }
        });
    }
  }

  componentWillUnmount() {
    this._isMounted = false;
  }

  save = () => {
    const { alert, pendingRearm } = this.state;

    alert.name = trim(alert.name) || getDefaultName(alert);
    alert.rearm = pendingRearm || null;

    return alert
      .$save()
      .then(() => {
        notification.success("Saved.");
        navigateTo(`/alerts/${alert.id}`, true, false);
        this.setState({ mode: MODES.VIEW });
      })
      .catch(() => {
        notification.error("Failed saving alert.");
      });
  };

  onQuerySelected = query => {
    this.setState(({ alert }) => ({
      alert: Object.assign(alert, { query }),
      queryResult: null,
    }));

    if (query) {
      // get cached result for column names and values
      new QueryService(query).getQueryResultPromise().then(queryResult => {
        if (this._isMounted) {
          this.setState({ queryResult });
          let { column } = this.state.alert.options;
          const columns = queryResult.getColumnNames();

          // default to first column name if none chosen, or irrelevant in current query
          if (!column || !includes(columns, column)) {
            column = head(queryResult.getColumnNames());
          }
          this.setAlertOptions({ column });
        }
      });
    }
  };

  onNameChange = name => {
    const { alert } = this.state;
    this.setState({
      alert: Object.assign(alert, { name }),
    });
  };

  onRearmChange = pendingRearm => {
    this.setState({ pendingRearm });
  };

  setAlertOptions = obj => {
    const { alert } = this.state;
    const options = { ...alert.options, ...obj };
    this.setState({
      alert: Object.assign(alert, { options }),
    });
  };

  delete = () => {
    const { alert } = this.state;
    return alert.$delete(
      () => {
        notification.success("Alert deleted successfully.");
        navigateTo("/alerts");
      },
      () => {
        notification.error("Failed deleting alert.");
      }
    );
  };

  mute = () => {
    const { alert } = this.state;
    return alert
      .$mute()
      .then(() => {
        this.setAlertOptions({ muted: true });
        notification.warn("Notifications have been muted.");
      })
      .catch(() => {
        notification.error("Failed muting notifications.");
      });
  };

  unmute = () => {
    const { alert } = this.state;
    return alert
      .$unmute()
      .then(() => {
        this.setAlertOptions({ muted: false });
        notification.success("Notifications have been restored.");
      })
      .catch(() => {
        notification.error("Failed restoring notifications.");
      });
  };

  edit = () => {
    const { id } = this.state.alert;
    navigateTo(`/alerts/${id}/edit`, true, false);
    this.setState({ mode: MODES.EDIT });
  };

  cancel = () => {
    const { id } = this.state.alert;
    navigateTo(`/alerts/${id}`, true, false);
    this.setState({ mode: MODES.VIEW });
  };

  render() {
    const { alert } = this.state;
    if (!alert) {
      return <LoadingState className="m-t-30" />;
    }

    const muted = !!alert.options.muted;
    const { queryResult, mode, canEdit, pendingRearm } = this.state;

    const menuButton = (
      <MenuButton doDelete={this.delete} muted={muted} mute={this.mute} unmute={this.unmute} canEdit={canEdit} />
    );

    const commonProps = {
      alert,
      queryResult,
      pendingRearm,
      save: this.save,
      menuButton,
      onQuerySelected: this.onQuerySelected,
      onRearmChange: this.onRearmChange,
      onNameChange: this.onNameChange,
      onCriteriaChange: this.setAlertOptions,
      onNotificationTemplateChange: this.setAlertOptions,
    };

    return (
      <div className="container alert-page">
        {mode === MODES.NEW && <AlertNew {...commonProps} />}
        {mode === MODES.VIEW && (
          <AlertView canEdit={canEdit} onEdit={this.edit} muted={muted} unmute={this.unmute} {...commonProps} />
        )}
        {mode === MODES.EDIT && <AlertEdit cancel={this.cancel} {...commonProps} />}
      </div>
    );
  }
}

// TODO: handleError
export default [
  {
    path: "/alerts/new",
    title: "New Alert",
    render: (routeParams, currentRoute, location) => (
      <Layout.DefaultAuthenticated>
        <AlertPage key={location.path} {...routeParams} />
      </Layout.DefaultAuthenticated>
    ),
    resolve: { mode: MODES.NEW },
  },
  {
    path: "/alerts/:alertId([0-9]+)",
    title: "Alert",
    render: (routeParams, currentRoute, location) => (
      <Layout.DefaultAuthenticated>
        <AlertPage key={location.path} {...routeParams} />
      </Layout.DefaultAuthenticated>
    ),
    resolve: { mode: MODES.VIEW },
  },
  {
    path: "/alerts/:alertId([0-9]+)/edit",
    title: "Alert",
    render: (routeParams, currentRoute, location) => (
      <Layout.DefaultAuthenticated>
        <AlertPage key={location.path} {...routeParams} />
      </Layout.DefaultAuthenticated>
    ),
    resolve: { mode: MODES.EDIT },
  },
];
